"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api, { parseApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  Alert,
  AuctionImage,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  ImageUploader,
  Input,
  Money,
  PageHeader,
  PageShell,
  Tabs,
} from "@/components/ui";

const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

interface WonAuction {
  id: string;
  title: string;
  currentPrice: number;
  imageUrl?: string;
  endTime: string;
  type: string;
  status: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  referenceId?: string;
  status: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  ENGLISH: "English",
  DUTCH: "Dutch",
  SEALED_BID: "Sealed Bid",
};

export default function ProfilePage() {
  const { user, setAuth, logout, token } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [updating, setUpdating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"won" | "transactions">("won");

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);
  useEffect(() => {
    if (user) {
      setName(user.name);
      setAvatar(user.avatar ?? "");
    }
  }, [user]);

  const { data: wonData } = useQuery({
    queryKey: ["won-auctions"],
    queryFn: () =>
      api
        .get("/users/me/won")
        .then((r) => r.data.auctions ?? [])
        .catch(() => []),
    enabled: !!user,
  });
  const { data: txData } = useQuery({
    queryKey: ["wallet-transactions"],
    queryFn: () =>
      api
        .get("/wallet/transactions?limit=50")
        .then((r) => r.data.transactions ?? [])
        .catch(() => []),
    enabled: !!user,
  });

  const update = async () => {
    if (!name.trim()) {
      setErr("Name cannot be empty");
      return;
    }
    const trimmedAvatar = avatar.trim();
    if (trimmedAvatar && !isHttpUrl(trimmedAvatar)) {
      setErr("Avatar must be a valid http(s) image URL");
      return;
    }
    setMsg("");
    setErr("");
    setUpdating(true);
    try {
      const body: { name: string; avatar?: string } = { name: name.trim() };
      if (trimmedAvatar) body.avatar = trimmedAvatar;
      const res = await api.put("/users/me", body);
      if (token) setAuth(res.data.user ?? res.data, token);
      setMsg("Profile updated");
      qc.invalidateQueries({ queryKey: ["won-auctions"] });
    } catch (e) {
      setErr(parseApiError(e, "Update failed"));
    } finally {
      setUpdating(false);
    }
  };

  if (!user) return null;

  const wonAuctions: WonAuction[] = wonData ?? [];
  const transactions: Transaction[] = txData ?? [];
  const paymentTxs = transactions.filter((t) => t.type === "PAYMENT");
  const settledIds = new Set(
    paymentTxs
      .filter((t) => t.amount < 0 && t.referenceId)
      .map((t) => t.referenceId as string)
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Account settings"
        title={user.name}
        subtitle={user.email}
        right={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link href="/dashboard" style={{ textDecoration: "none" }}>
              <Button variant="ghost" size="sm">← Dashboard</Button>
            </Link>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              Log out
            </Button>
          </div>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))",
          gap: "1.5rem",
        }}
      >
        <Card padding="lg">
          <div style={{ display: "flex", gap: "1.25rem", alignItems: "center", marginBottom: "1.5rem" }}>
            <Avatar
              name={user.name}
              src={isHttpUrl(avatar.trim()) ? avatar.trim() : null}
              size={56}
              style={{ fontSize: "1.2rem" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "var(--font-lg)" }}>{user.name}</div>
              <div
                style={{
                  fontSize: "var(--font-sm)",
                  color: "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {user.email}
                <Badge tone={user.role === "ADMIN" ? "accent" : "neutral"}>
                  {user.role}
                </Badge>
              </div>
            </div>
          </div>

          {err && <Alert tone="error" style={{ marginBottom: "0.75rem" }}>{err}</Alert>}
          {msg && <Alert tone="success" style={{ marginBottom: "0.75rem" }}>{msg}</Alert>}

          <Field label="Display name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && update()}
            />
          </Field>

          <Field
            label="Avatar"
            hint="Upload a file or paste a link"
            style={{ marginTop: "1rem" }}
          >
            <ImageUploader
              label="Upload avatar"
              onUploaded={(url) => setAvatar(url)}
            />
            <Input
              type="url"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && update()}
              placeholder="https://…/photo.jpg"
              invalid={!!avatar.trim() && !isHttpUrl(avatar.trim())}
              style={{ marginTop: "0.5rem" }}
            />
          </Field>

          <Button
            onClick={update}
            loading={updating}
            fullWidth
            style={{ marginTop: "1rem" }}
          >
            Save changes
          </Button>
        </Card>

        <div>
          <Tabs
            items={[
              { key: "won", label: "Won auctions", count: wonAuctions.length },
              { key: "transactions", label: "Payments", count: paymentTxs.length },
            ]}
            active={tab}
            onChange={(k) => setTab(k as "won" | "transactions")}
          />

          {tab === "won" && (
            <div style={{ marginTop: "1rem" }}>
              {wonAuctions.length === 0 ? (
                <EmptyState title="No auctions won yet" />
              ) : (
                <Card padding="none">
                  {wonAuctions.map((a) => {
                    const isSettled = settledIds.has(a.id);
                    const verificationCode = `AH-${a.id.slice(0, 8).toUpperCase()}`;
                    return (
                      <div
                        key={a.id}
                        style={{
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <Link
                          href={`/auctions/${a.id}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "1rem 1.25rem",
                            gap: "1rem",
                            color: "inherit",
                          }}
                        >
                          {a.imageUrl && (
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: "var(--radius)",
                                overflow: "hidden",
                                flexShrink: 0,
                                border: "1px solid var(--border)",
                              }}
                            >
                              <AuctionImage src={a.imageUrl} alt={a.title} />
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: "var(--font-base)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                marginBottom: "0.25rem",
                              }}
                            >
                              {a.title}
                            </div>
                            <div
                              style={{
                                fontSize: "var(--font-xs)",
                                color: "var(--muted)",
                                display: "flex",
                                gap: "0.75rem",
                                alignItems: "center",
                              }}
                            >
                              <span>{TYPE_LABEL[a.type] ?? a.type}</span>
                              <span>
                                {new Date(a.endTime).toLocaleDateString([], {
                                  dateStyle: "medium",
                                })}
                              </span>
                              <span className="mono">{verificationCode}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <Money value={a.currentPrice} size="sm" color="var(--success)" />
                            <div
                              style={{
                                fontSize: "var(--font-xs)",
                                fontWeight: 700,
                                color: isSettled ? "var(--success)" : "var(--muted)",
                                marginTop: 4,
                              }}
                            >
                              {isSettled ? "Paid" : "Pending"}
                            </div>
                          </div>
                        </Link>
                        <div
                          style={{
                            padding: "0.6rem 1.25rem",
                            background: "var(--surface-2)",
                            borderTop: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.75rem",
                            fontSize: "var(--font-xs)",
                            color: "var(--muted)",
                          }}
                        >
                          <span>Show verification code to seller to claim your item</span>
                          <Button
                            variant={copiedId === a.id ? "success" : "ghost"}
                            size="sm"
                            onClick={() => {
                              navigator.clipboard
                                .writeText(
                                  `AuctionHaus Winner Certificate\nWinner: ${user.name}\nItem: ${a.title}\nWinning Bid: ₹${a.currentPrice.toLocaleString("en-IN")}\nDate: ${new Date(a.endTime).toLocaleDateString()}\nVerification: ${verificationCode}`
                                )
                                .then(() => {
                                  setCopiedId(a.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                })
                                .catch(() => {});
                            }}
                          >
                            {copiedId === a.id ? "Copied" : "Copy certificate"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}
            </div>
          )}

          {tab === "transactions" && (
            <div style={{ marginTop: "1rem" }}>
              {paymentTxs.length === 0 ? (
                <EmptyState title="No payments yet" />
              ) : (
                <Card padding="none">
                  {paymentTxs.map((tx, i) => (
                    <div
                      key={tx.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        gap: "1rem",
                        padding: "1rem 1.25rem",
                        borderBottom:
                          i < paymentTxs.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "var(--font-sm)" }}>
                          {tx.description}
                        </div>
                        <div
                          style={{
                            fontSize: "var(--font-xs)",
                            color: "var(--muted)",
                            marginTop: 2,
                          }}
                        >
                          {new Date(tx.createdAt).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                      </div>
                      <Money
                        value={tx.amount}
                        size="sm"
                        color={tx.amount < 0 ? "var(--danger)" : "var(--success)"}
                      />
                      <Badge
                        tone={tx.status === "COMPLETED" ? "success" : "neutral"}
                      >
                        {tx.status}
                      </Badge>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
