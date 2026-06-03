"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { parseApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  PageShell,
  Skeleton,
  Stat,
  StatGrid,
} from "@/components/ui";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description?: string;
  createdAt: string;
}

export default function WalletPage() {
  const { user, token } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.get("/wallet").then((r) => r.data),
    enabled: !!user,
  });

  const { data: txData } = useQuery({
    queryKey: ["transactions"],
    queryFn: () =>
      api.get("/wallet/transactions").then((r) => r.data.transactions ?? []),
    enabled: !!user,
  });

  const wallet = data?.wallet;
  const txs: Transaction[] = txData ?? [];
  const available = wallet ? wallet.balance - wallet.heldAmount : 0;
  const isEmpty = wallet && wallet.balance === 0 && wallet.heldAmount === 0;
  const DEPOSIT_CAP = 100000;

  const handleAction = async () => {
    setMsg("");
    setErr("");
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setErr("Enter a valid amount");
      return;
    }
    if (action === "deposit" && val > DEPOSIT_CAP) {
      setErr(`Single deposit cap is ${DEPOSIT_CAP.toLocaleString("en-IN")}. Place multiple deposits if needed.`);
      return;
    }
    if (action === "withdraw" && wallet && val > available) {
      setErr(`Insufficient funds. Available: ${available.toLocaleString("en-IN")}`);
      return;
    }
    setBusy(true);
    try {
      await api.post(`/wallet/${action}`, { amount: val });
      setMsg(
        `${action === "deposit" ? "Deposited" : "Withdrew"} ₹${val.toLocaleString("en-IN")}`
      );
      setAmount("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    } catch (e) {
      setErr(parseApiError(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const fundingTxs = txs.filter((t) =>
    ["DEPOSIT", "WITHDRAWAL"].includes(t.type)
  );
  const activityTxs = txs.filter(
    (t) => !["DEPOSIT", "WITHDRAWAL"].includes(t.type)
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Account"
        title="Wallet"
        subtitle="Deposits, withdrawals, and per-auction holds."
      />

      {!isLoading && isEmpty && (
        <Alert tone="info" style={{ marginBottom: "1.25rem" }}>
          <strong>Fund your wallet to start bidding.</strong>{" "}
          Place a deposit on the right, then head to the catalogue. All bids
          are mock-paid out of the wallet balance below.
        </Alert>
      )}

      {isLoading || !wallet ? (
        <StatGrid minWidth={260}>
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "1.5rem",
              }}
            >
              <Skeleton width="40%" height={12} />
              <div style={{ height: 16 }} />
              <Skeleton width="60%" height={28} />
            </div>
          ))}
        </StatGrid>
      ) : (
        <StatGrid minWidth={260}>
          <Stat
            label="Total balance"
            value={<Money value={wallet.balance} size="lg" />}
          />
          <Stat
            label="Available"
            value={<Money value={available} size="lg" color="var(--success)" />}
          />
          <Stat
            label="Held in escrow"
            value={<Money value={wallet.heldAmount} size="lg" color="var(--muted)" />}
          />
        </StatGrid>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: "1.5rem",
          marginTop: "2rem",
        }}
      >
        <section>
          <SectionTitle>Funding</SectionTitle>
          <Card padding="lg">
            <div style={{ display: "flex", gap: 0, marginBottom: "1.25rem" }}>
              {(["deposit", "withdraw"] as const).map((a, i) => {
                const isActive = action === a;
                return (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    style={{
                      flex: 1,
                      padding: "0.7rem",
                      border: `1px solid ${isActive ? "var(--accent)" : "var(--border-hard)"}`,
                      borderRight: i === 0 ? "none" : undefined,
                      borderTopLeftRadius: i === 0 ? "var(--radius)" : 0,
                      borderBottomLeftRadius: i === 0 ? "var(--radius)" : 0,
                      borderTopRightRadius: i === 1 ? "var(--radius)" : 0,
                      borderBottomRightRadius: i === 1 ? "var(--radius)" : 0,
                      background: isActive
                        ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                        : "var(--surface)",
                      color: isActive ? "var(--accent)" : "var(--text-soft)",
                      fontWeight: 700,
                      fontSize: "var(--font-xs)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {a}
                  </button>
                );
              })}
            </div>

            {err && (
              <Alert tone="error" style={{ marginBottom: "0.75rem" }}>
                {err}
              </Alert>
            )}
            {msg && (
              <Alert tone="success" style={{ marginBottom: "0.75rem" }}>
                {msg}
              </Alert>
            )}

            <Field label="Amount">
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Input
                  type="number"
                  min="1"
                  max={action === "deposit" ? DEPOSIT_CAP : available || undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={action === "deposit" ? `Up to ${DEPOSIT_CAP.toLocaleString("en-IN")}` : "Amount"}
                />
                <Button
                  onClick={handleAction}
                  loading={busy}
                  variant={action === "deposit" ? "primary" : "danger"}
                >
                  {action === "deposit" ? "Deposit" : "Withdraw"}
                </Button>
              </div>
            </Field>
            <div
              style={{
                marginTop: "0.5rem",
                fontSize: "var(--font-xs)",
                color: "var(--muted)",
              }}
            >
              {action === "deposit"
                ? `Single-deposit cap: ${DEPOSIT_CAP.toLocaleString("en-IN")}. Place multiple deposits if you need more.`
                : `Withdrawable now: ${available.toLocaleString("en-IN")} (excludes amounts held in active bids).`}
            </div>
          </Card>

          <div style={{ marginTop: "1.5rem" }}>
            <SectionTitle>Funding history</SectionTitle>
            <TransactionList txs={fundingTxs} />
          </div>
        </section>

        <section>
          <SectionTitle>Bid activity (holds &amp; releases)</SectionTitle>
          <TransactionList txs={activityTxs} />
        </section>
      </div>
    </PageShell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "var(--font-xs)",
        fontWeight: 700,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "0.75rem",
      }}
    >
      {children}
    </div>
  );
}

function TransactionList({ txs }: { txs: Transaction[] }) {
  if (txs.length === 0) {
    return <EmptyState title="No transactions yet" />;
  }
  return (
    <Card padding="none">
      {txs.map((tx, i) => (
        <div
          key={tx.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            gap: "1rem",
            padding: "1rem 1.25rem",
            borderBottom:
              i < txs.length - 1 ? "1px solid var(--border)" : "none",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.2rem",
              }}
            >
              <Badge tone={txTone(tx.type)}>
                {tx.type.replace(/_/g, " ")}
              </Badge>
            </div>
            <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)" }}>
              {tx.description ? (
                <>
                  {tx.description}
                  <span style={{ margin: "0 0.4em" }}>·</span>
                </>
              ) : null}
              {new Date(tx.createdAt).toLocaleString([], {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </div>
          </div>
          <Money
            value={tx.amount}
            color={tx.amount >= 0 ? "var(--success)" : "var(--danger)"}
            size="sm"
          />
        </div>
      ))}
    </Card>
  );
}

function txTone(
  type: string
):
  | "neutral"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "dutch"
  | "sealed"
  | "english" {
  switch (type) {
    case "DEPOSIT":
    case "BID_RELEASE":
    case "REFUND":
      return "success";
    case "WITHDRAWAL":
    case "BID_HOLD":
    case "PAYMENT":
      return "danger";
    default:
      return "neutral";
  }
}
