"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { parseApiError } from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Money,
  Skeleton,
} from "@/components/ui";

/**
 * Phase C6 — Cryptographic Sealed-Bid Commitment Panel
 *
 * Shown on sealed-bid auction detail pages in place of (or alongside) the
 * normal bid form. Provides:
 *   - ACTIVE phase: a "Create commitment" form that generates a random nonce
 *     client-side, computes SHA-256(amountCents:nonce), and POSTs only the hash.
 *     The server NEVER learns the bid amount during the live phase.
 *   - ENDED phase: a "Reveal your bid" form that sends (amount, nonce) so the
 *     server can verify the hash and record the revealed bid.
 *   - Commitment list: after ENDED, shows all revealed bids in order.
 *
 * Hash algorithm (mirrors commitment.service.ts::hashCommitment):
 *   commitHash = SHA-256(amountCents.toString(16) + ":" + nonce)
 *   where amountCents = Math.round(amount * 100)
 *
 * Nonce is generated with crypto.getRandomValues() for strong randomness.
 * Both hash and nonce are stored in localStorage under key
 * `ah_commit_{auctionId}` so the user can reveal even after a page reload.
 */

interface Commitment {
  id: string;
  bidderId: string;
  bidderName: string | null;
  commitHash: string;
  isValid: boolean | null;
  revealedAmount: number | null;
  revealedAt: string | null;
}

function randomNonce(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256hex(message: string): Promise<string> {
  const msgBuf = new TextEncoder().encode(message);
  const hashBuf = await crypto.subtle.digest("SHA-256", msgBuf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function storageKey(auctionId: string) {
  return `ah_commit_${auctionId}`;
}

interface StoredCommit {
  amount: number;
  nonce: string;
  hash: string;
}

function loadStored(auctionId: string): StoredCommit | null {
  try {
    const raw = localStorage.getItem(storageKey(auctionId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStored(auctionId: string, data: StoredCommit) {
  try {
    localStorage.setItem(storageKey(auctionId), JSON.stringify(data));
  } catch {}
}

function clearStored(auctionId: string) {
  try {
    localStorage.removeItem(storageKey(auctionId));
  } catch {}
}

export function CommitmentPanel({
  auctionId,
  auctionStatus,
  startingPrice,
  viewerId,
}: {
  auctionId: string;
  auctionStatus: string;
  startingPrice: number;
  viewerId: string | undefined;
}) {
  const qc = useQueryClient();
  const isActive = auctionStatus === "ACTIVE";
  const isEnded = auctionStatus === "ENDED";

  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [storedCommit, setStoredCommit] = React.useState<StoredCommit | null>(null);

  // Reveal state
  const [revealAmount, setRevealAmount] = React.useState("");
  const [revealNonce, setRevealNonce] = React.useState("");

  React.useEffect(() => {
    const stored = loadStored(auctionId);
    if (stored) {
      setStoredCommit(stored);
      setRevealAmount(String(stored.amount));
      setRevealNonce(stored.nonce);
    }
  }, [auctionId]);

  const { data: commitmentsData, isLoading } = useQuery({
    queryKey: ["commitments", auctionId],
    queryFn: () =>
      api
        .get(`/bids/auctions/${auctionId}/commitments`)
        .then((r) => r.data.commitments as Commitment[]),
    enabled: !!viewerId && isEnded,
  });

  const commit = async () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= startingPrice) {
      setErr(`Amount must be above ₹${startingPrice.toLocaleString("en-IN")}`);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const nonce = randomNonce();
      const cents = toCents(parsed);
      const hash = await sha256hex(`${cents.toString(16)}:${nonce}`);

      await api.post(`/bids/auctions/${auctionId}/commit`, { commitHash: hash });

      const stored: StoredCommit = { amount: parsed, nonce, hash };
      saveStored(auctionId, stored);
      setStoredCommit(stored);
      setRevealAmount(String(parsed));
      setRevealNonce(nonce);
      setAmount("");
      setSuccess("Commitment stored. Your bid is sealed — reveal after the auction ends.");
    } catch (e) {
      setErr(parseApiError(e, "Commitment failed"));
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    const parsed = parseFloat(revealAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setErr("Enter the exact amount you bid");
      return;
    }
    if (!revealNonce) {
      setErr("Nonce is required — it was saved to your browser during the commit phase");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await api.post(`/bids/auctions/${auctionId}/reveal`, {
        amount: parsed,
        nonce: revealNonce,
      });
      clearStored(auctionId);
      setStoredCommit(null);
      setSuccess("Bid revealed and verified.");
      qc.invalidateQueries({ queryKey: ["commitments", auctionId] });
    } catch (e) {
      setErr(parseApiError(e, "Reveal failed"));
    } finally {
      setBusy(false);
    }
  };

  if (!viewerId) return null;

  return (
    <Card padding="none">
      <CardHeader>
        Cryptographic Sealed Bid
        <Badge tone="sealed" style={{ marginLeft: 8 }}>C6 / W1</Badge>
      </CardHeader>

      <div style={{ padding: "1.25rem" }}>
        <div style={{ fontSize: "var(--font-xs)", color: "var(--text-soft)", marginBottom: "1rem", lineHeight: 1.55 }}>
          {isActive ? (
            <>
              Submit a <strong>commitment hash</strong> — the server stores only a
              SHA-256 fingerprint of your bid. Your actual amount stays private until
              you reveal after the auction closes. Losing the nonce means you cannot
              reveal; it is saved in your browser automatically.
            </>
          ) : (
            <>
              Reveal your sealed bid below. The server will verify
              SHA-256(amountCents:nonce) matches your earlier commitment.
            </>
          )}
        </div>

        {err && <Alert tone="error" style={{ marginBottom: "0.75rem" }}>{err}</Alert>}
        {success && <Alert tone="success" style={{ marginBottom: "0.75rem" }}>{success}</Alert>}

        {isActive && (
          <>
            {storedCommit ? (
              <div>
                <Alert tone="success" style={{ marginBottom: "0.75rem" }}>
                  Commitment active — bid: <Money value={storedCommit.amount} size="xs" />
                  {" · "}nonce saved to browser.
                </Alert>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "var(--font-xs)",
                    color: "var(--muted)",
                    wordBreak: "break-all",
                    background: "var(--surface-2)",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Hash: {storedCommit.hash}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ marginTop: "0.5rem" }}
                  onClick={() => {
                    setStoredCommit(null);
                    clearStored(auctionId);
                    setSuccess("");
                  }}
                >
                  Replace commitment
                </Button>
              </div>
            ) : (
              <Field label={`Bid amount (above ₹${startingPrice.toLocaleString("en-IN")})`}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`> ₹${startingPrice.toLocaleString("en-IN")}`}
                    onKeyDown={(e) => e.key === "Enter" && commit()}
                  />
                  <Button loading={busy} onClick={commit}>
                    Commit
                  </Button>
                </div>
              </Field>
            )}
          </>
        )}

        {isEnded && (
          <>
            <Field label="Your bid amount (₹)">
              <Input
                type="number"
                value={revealAmount}
                onChange={(e) => setRevealAmount(e.target.value)}
                placeholder="Exact amount you committed"
              />
            </Field>
            <Field label="Nonce (auto-filled from browser)" style={{ marginTop: "0.75rem" }}>
              <Input
                value={revealNonce}
                onChange={(e) => setRevealNonce(e.target.value)}
                placeholder="64-char hex nonce"
                style={{ fontFamily: "monospace", fontSize: "var(--font-xs)" }}
              />
            </Field>
            <Button
              fullWidth
              loading={busy}
              onClick={reveal}
              style={{ marginTop: "0.75rem" }}
            >
              Reveal bid
            </Button>

            {isLoading ? (
              <div style={{ marginTop: "1rem" }}>
                <Skeleton height={14} />
                <div style={{ height: 8 }} />
                <Skeleton height={14} width="70%" />
              </div>
            ) : commitmentsData && commitmentsData.length > 0 ? (
              <div style={{ marginTop: "1.25rem" }}>
                <div style={{ fontSize: "var(--font-xs)", fontWeight: 700, color: "var(--muted)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Revealed bids
                </div>
                {commitmentsData
                  .filter((c) => c.isValid && c.revealedAmount != null)
                  .sort((a, b) => (b.revealedAmount ?? 0) - (a.revealedAmount ?? 0))
                  .map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.6rem 0.75rem",
                        background: i === 0 ? "color-mix(in srgb, var(--success) 8%, transparent)" : "var(--surface-2)",
                        border: `1px solid ${i === 0 ? "var(--success)" : "var(--border)"}`,
                        borderRadius: "var(--radius)",
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontWeight: i === 0 ? 700 : 500, fontSize: "var(--font-sm)" }}>
                        {c.bidderName ?? "Anonymous"}
                        {i === 0 && <Badge tone="success" style={{ marginLeft: 6 }}>Winner</Badge>}
                      </span>
                      <Money value={c.revealedAmount} size="sm" color={i === 0 ? "var(--success)" : "var(--text)"} />
                    </div>
                  ))}

                {commitmentsData.filter((c) => !c.isValid && c.revealedAt).length > 0 && (
                  <Alert tone="warning" style={{ marginTop: "0.5rem" }}>
                    {commitmentsData.filter((c) => !c.isValid && c.revealedAt).length} commitment(s) failed verification.
                  </Alert>
                )}
              </div>
            ) : isEnded ? (
              <EmptyState title="No reveals yet" hint="Be the first to reveal your commitment." style={{ marginTop: "1rem" }} />
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
