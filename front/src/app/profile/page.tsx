"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { parseApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

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

export default function ProfilePage() {
  const { user, setAuth, logout, token } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"won" | "transactions">("won");

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  // Fetch won auctions
  const { data: wonData } = useQuery({
    queryKey: ["won-auctions"],
    queryFn: () =>
      api
        .get("/users/me/won")
        .then((r) => r.data.auctions ?? [])
        .catch(() => []),
    enabled: !!user });

  // Fetch wallet transactions to check payment history
  const { data: txData } = useQuery({
    queryKey: ["wallet-transactions"],
    queryFn: () =>
      api
        .get("/wallet/transactions?limit=50")
        .then((r) => r.data.transactions ?? [])
        .catch(() => []),
    enabled: !!user });

  const update = async () => {
    if (!name.trim()) return setErr("Name cannot be empty");
    setMsg("");
    setErr("");
    setIsUpdating(true);
    try {
      const res = await api.put("/users/me", { name: name.trim() });
      if (token) setAuth(res.data.user ?? res.data, token);
      setMsg("Profile updated");
      qc.invalidateQueries({ queryKey: ["won-auctions"] });
    } catch (e: unknown) {
      setErr(parseApiError(e, "Update failed"));
    } finally {
      setIsUpdating(false);
    }
  };

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const wonAuctions: WonAuction[] = wonData ?? [];
  const transactions: Transaction[] = txData ?? [];

  // Filter to only payment transactions (won auctions / sold auctions)
  const paymentTxs = transactions.filter((t) => t.type === "PAYMENT");

  const typeLabel: Record<string, string> = {
    ENGLISH: "English",
    DUTCH: "Dutch",
    SEALED_BID: "Sealed Bid" };

  // For each won auction, check if payment was auto-settled
  const settledAuctionIds = new Set(
    paymentTxs
      .filter((t) => t.amount < 0 && t.referenceId)
      .map((t) => t.referenceId as string)
  );

  return (
    <div style={{ maxWidth: "100%", margin: "0", padding: "4rem 4vw", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "4vw", alignItems: "start" }}>
      <div>
      {/* ── Header ── */}
      <div
        style={{
          padding: "2.5rem 2rem",
          borderBottom: "none",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          gap: "1.25rem" }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 56,
            height: 56,
            background: "var(--text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: "1.2rem",
            color: "#fff",
            flexShrink: 0 }}
        >
          {initials}
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 700,


              color: "var(--muted)",
              marginBottom: "0.25rem" }}
          >
            Account Settings
          </div>
          <h1
            style={{
              fontSize: "var(--font-xl)",
              fontWeight: 600,

              lineHeight: 1,
              marginBottom: "0.3rem" }}
          >
            {user.name}
          </h1>
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--muted)",
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap" }}
          >
            <span>{user.email}</span>
            <span
              style={{
                fontSize: "var(--font-xs)",
                fontWeight: 700,


                color: "var(--accent)",
                border: "1px solid var(--accent)",
                padding: "0.1rem 0.45rem" }}
            >
              {user.role}
            </span>
            {wonAuctions.length > 0 && (
              <span
                style={{
                  fontSize: "var(--font-xs)",
                  color: "var(--success)",
                  fontWeight: 700 }}
              >
                {wonAuctions.length} won
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
          <Link
            href="/dashboard"
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 500,


              color: "var(--muted)",
              padding: "0.5rem 0.75rem",
              flexShrink: 0,
              textDecoration: "none"
            }}
          >
            ← DASHBOARD
          </Link>
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 500,


              color: "var(--accent)",
              background: "none",
              border: "1.5px solid var(--accent)",
              padding: "0.5rem 0.75rem",
              cursor: "pointer" }}
          >
            LOGOUT
          </button>
        </div>
      </div>

      {/* ── Edit Name ── */}
      <div
        style={{
          borderBottom: "none" }}
      >
        <div
          style={{
            padding: "0.85rem 2rem",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
            fontWeight: 500,
            fontSize: "var(--font-xs)" }}
        >
          Edit Profile
        </div>

        <div style={{ padding: "1.5rem 2rem", background: "var(--surface)" }}>
          {err && (
            <div
              style={{
                padding: "0.85rem 1rem",
                background: "rgba(196,30,30,0.08)",
                border: "1.5px solid var(--accent)",
                color: "var(--accent)",
                fontSize: "var(--font-sm)",
                fontWeight: 500,


                marginBottom: "1.5rem" }}
            >
              {err}
            </div>
          )}
          {msg && (
            <div
              style={{
                padding: "0.85rem 1rem",
                background: "rgba(26,127,60,0.08)",
                border: "1.5px solid var(--success)",
                color: "var(--success)",
                fontSize: "var(--font-sm)",
                fontWeight: 500,


                marginBottom: "1.5rem" }}
            >
              {msg}
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem", maxWidth: 460 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: 700, fontSize: "var(--font-xs)" }}>
                Display Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && update()}
              />
            </div>
            <button
              onClick={update}
              disabled={isUpdating}
              style={{
                background: isUpdating ? "var(--surface-2)" : "var(--text)",
                color: isUpdating ? "var(--muted)" : "var(--bg)",
                alignSelf: "flex-end",
                whiteSpace: "nowrap",
                fontWeight: 500,


                padding: "0.85rem 1.5rem",
                cursor: isUpdating ? "not-allowed" : "pointer"
              }}
            >
              {isUpdating ? "SAVING..." : "SAVE"}
            </button>
          </div>
        </div>
      </div>
      </div>

      <div>
      {/* ── Section Tabs ── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)" }}
      >
        {(["won", "transactions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSection(tab)}
            style={{
              padding: "0.85rem 1.5rem",
              fontWeight: 700,
              fontSize: "var(--font-sm)",


              background: "none",
              border: "none",
              borderBottom: activeSection === tab ? "2.5px solid var(--accent)" : "2.5px solid transparent",
              color: activeSection === tab ? "var(--accent)" : "var(--muted)",
              cursor: "pointer",
              transition: "color 0.15s" }}
          >
            {tab === "won" ? `Won Auctions (${wonAuctions.length})` : `Transactions (${paymentTxs.length})`}
          </button>
        ))}
      </div>

      {/* ── Won Auctions ── */}
      {activeSection === "won" && (
        <div>
          {wonAuctions.length === 0 ? (
            <div
              style={{
                padding: "2.5rem 2rem",
                textAlign: "center",
                color: "var(--muted)",
                fontSize: "var(--font-sm)",
                fontWeight: 500,


                background: "var(--surface)",
                borderTop: "none"
              }}
            >
              No auctions won yet
            </div>
          ) : (
            <div>
              {wonAuctions.map((a) => {
                const isSettled = settledAuctionIds.has(a.id);
                const verificationCode = `AH-${a.id.slice(0, 8).toUpperCase()}`;
                return (
                  <div
                    key={a.id}
                    style={{
                      borderTop: "none",
                      background: "var(--surface)" }}
                  >
                    <Link
                      href={`/auctions/${a.id}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "1rem 2rem",
                        textDecoration: "none",
                        color: "inherit",
                        transition: "background 0.15s",
                        gap: "1rem" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "var(--font-base)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginBottom: "0.25rem" }}
                        >
                          {a.title}
                        </div>
                        <div
                          style={{
                            fontSize: "var(--font-xs)",
                            color: "var(--muted)",
                            display: "flex",
                            gap: "0.75rem",
                            alignItems: "center" }}
                        >
                          <span>{typeLabel[a.type] ?? a.type}</span>
                          <span>
                            {new Date(a.endTime).toLocaleDateString([], {
                              dateStyle: "medium" })}
                          </span>
                          <span
                            style={{

                              color: "var(--muted)" }}
                          >
                            {verificationCode}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "var(--font-lg)",
                            color: "var(--success)" }}
                        >
                          ₹{a.currentPrice?.toLocaleString()}
                        </div>
                        <div
                          style={{
                            fontSize: "var(--font-xs)",
                            fontWeight: 700,


                            color: isSettled ? "var(--success)" : "var(--muted)" }}
                        >
                          {isSettled ? "✓ Paid" : "Pending"}
                        </div>
                      </div>
                    </Link>
                    {/* Delivery action row */}
                    <div
                      style={{
                        padding: "0.6rem 2rem",
                        background: "var(--surface-2)",
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        justifyContent: "space-between",
                        fontSize: "var(--font-xs)" }}
                    >
                      <span style={{ color: "var(--muted)", fontWeight: 600 }}>
                        Show verification code to seller to claim your item
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `AuctionHaus Winner Certificate\nWinner: ${user.name}\nItem: ${a.title}\nWinning Bid: ₹${a.currentPrice?.toLocaleString()}\nDate: ${new Date(a.endTime).toLocaleDateString()}\nVerification: ${verificationCode}`
                          ).then(() => {
                            setCopiedId(a.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }).catch(() => {});
                        }}
                        style={{
                          background: copiedId === a.id ? "var(--success)" : "none",
                          border: `1.5px solid ${copiedId === a.id ? "var(--success)" : "var(--border-hard)"}`,
                          color: copiedId === a.id ? "var(--bg)" : "var(--text)",
                          padding: "0.5rem 0.75rem",
                          fontWeight: 500,
                          fontSize: "var(--font-xs)",


                          cursor: "pointer",
                          flexShrink: 0,
                          transition: "all 0.2s"
                        }}
                      >
                        {copiedId === a.id ? "COPIED" : "COPY CERTIFICATE"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Transactions ── */}
      {activeSection === "transactions" && (
        <div>
          {paymentTxs.length === 0 ? (
            <div
              style={{
                padding: "2.5rem 2rem",
                textAlign: "center",
                color: "var(--muted)",
                fontSize: "var(--font-sm)",
                fontWeight: 500,


                background: "var(--surface)",
                borderTop: "none"
              }}
            >
              No payment transactions yet
            </div>
          ) : (
            <div>
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  padding: "0.85rem 2rem",
                  background: "var(--surface-2)",
                  borderTop: "none",
                  fontSize: "var(--font-xs)",
                  fontWeight: 500,


                  color: "var(--muted)" }}
              >
                <span>Description</span>
                <span style={{ minWidth: 80, textAlign: "right" }}>Amount</span>
                <span style={{ minWidth: 80, textAlign: "right" }}>Status</span>
              </div>
              {paymentTxs.map((tx) => (
                <div
                  key={tx.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    padding: "1rem 2rem",
                    borderTop: "none",
                    background: "var(--surface)",
                    alignItems: "center",
                    gap: "1rem" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--font-sm)" }}>
                      {tx.description}
                    </div>
                    <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)", marginTop: "0.15rem" }}>
                      {new Date(tx.createdAt).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short" })}
                    </div>
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 80,
                      textAlign: "right",
                      color: tx.amount < 0 ? "var(--accent)" : "var(--success)" }}
                  >
                    {tx.amount < 0 ? "-" : "+"}₹{Math.abs(tx.amount).toLocaleString()}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-xs)",
                      fontWeight: 700,


                      minWidth: 80,
                      textAlign: "right",
                      color: tx.status === "COMPLETED" ? "var(--success)" : "var(--muted)" }}
                  >
                    {tx.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
