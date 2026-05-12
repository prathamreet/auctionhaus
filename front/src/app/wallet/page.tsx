"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { parseApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  const { data } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.get("/wallet").then((r) => r.data),
    enabled: !!user,
  });

  const { data: txData } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => api.get("/wallet/transactions").then((r) => r.data.transactions),
    enabled: !!user,
  });

  const handleAction = async () => {
    setMsg(""); setErr("");
    const val = parseFloat(amount);
    if (!val || val <= 0) { setErr("Enter a valid amount"); return; }

    // Client-side withdrawal validation
    if (action === "withdraw" && wallet) {
      const avail = wallet.balance - wallet.heldAmount;
      if (val > avail) {
        setErr(`Insufficient funds. Available balance: \u20B9${avail.toLocaleString()}`);
        return;
      }
    }

    try {
      await api.post(`/wallet/${action}`, { amount: val });
      setMsg(`${action === "deposit" ? "Deposited" : "Withdrawn"} \u20B9${val.toLocaleString()}`);
      setAmount("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    } catch (e: unknown) {
      setErr(parseApiError(e, "Action failed"));
    }
  };

  const wallet = data?.wallet;
  const txs: Transaction[] = txData ?? [];

  const available = wallet ? wallet.balance - wallet.heldAmount : 0;

  return (
    <div style={{ maxWidth: "100%", margin: "0", padding: "4rem 4vw" }}>
      <h1 style={{ fontWeight: 900, fontSize: "var(--font-2xl)", marginBottom: "2rem", letterSpacing: "-0.03em", textTransform: "uppercase" }}>
        Wallet System
      </h1>

      {/* ── TOP SECTION: Balances ── */}
      {wallet && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", marginBottom: "4rem" }}>
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--border-hard)", padding: "2rem" }}>
             <h2 style={{ fontWeight: 800, fontSize: "var(--font-sm)", marginBottom: "1.5rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>TOTAL BALANCE</h2>
             <BalCard label="Overall Funds" value={wallet.balance} color="var(--text)" />
          </div>
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--border-hard)", padding: "2rem" }}>
             <h2 style={{ fontWeight: 800, fontSize: "var(--font-sm)", marginBottom: "1.5rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>AVAILABLE TO WITHDRAW</h2>
             <BalCard label="Available" value={available} color="var(--success)" />
          </div>
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--border-hard)", padding: "2rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
             <div>
               <h2 style={{ fontWeight: 800, fontSize: "var(--font-sm)", marginBottom: "1.5rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>ESCROW & HOLDS</h2>
               <BalCard label="Held (Active Bids)" value={wallet.heldAmount} color="var(--muted)" />
             </div>
             <p style={{ marginTop: "1rem", fontSize: "var(--font-xs)", color: "var(--muted)", lineHeight: 1.5 }}>
               Funds locked in active auctions. Will be released if outbid.
             </p>
          </div>
        </div>
      )}

      {/* ── SPLIT LAYOUT: Left (Bids) & Right (Funding) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "4vw", alignItems: "start" }}>
        
        {/* ── LEFT PANE: Bid Activity ── */}
        <div>
          <h2 style={{ fontWeight: 800, fontSize: "var(--font-sm)", marginBottom: "1.5rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            BID ACTIVITY (HOLDS & RELEASES)
          </h2>
          <TransactionList txs={txs.filter((t) => !["DEPOSIT", "WITHDRAWAL"].includes(t.type))} />
        </div>

        {/* ── RIGHT PANE: Deposits & Withdrawals ── */}
        <div>
          <h2 style={{ fontWeight: 800, fontSize: "var(--font-sm)", marginBottom: "1.5rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            FUNDING (DEPOSIT & WITHDRAW)
          </h2>
          
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--border-hard)", borderRadius: 0, padding: "2rem", marginBottom: "2rem" }}>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
              {(["deposit", "withdraw"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  style={{
                    flex: 1,
                    padding: "0.85rem",
                    borderRadius: 0,
                    border: "1.5px solid var(--border-hard)",
                    background: action === a ? "var(--accent)" : "var(--bg)",
                    color: action === a ? "#fff" : "var(--muted)",
                    fontWeight: 800,
                    fontSize: "var(--font-xs)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
            {err && <p style={errStyle}>{err}</p>}
            {msg && <p style={successStyle}>{msg}</p>}
            <div style={{ display: "flex", gap: "1rem" }}>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="AMOUNT (₹)"
                style={{ flex: 1, borderRadius: 0, border: "1.5px solid var(--border-hard)", padding: "0.85rem 1rem", background: "var(--bg)", fontWeight: 700 }}
              />
              <button
                onClick={handleAction}
                style={{
                  background: action === "deposit" ? "var(--text)" : "var(--accent)",
                  color: "var(--bg)",
                  border: "1.5px solid var(--border-hard)",
                  borderRadius: 0,
                  padding: "0.85rem 2rem",
                  fontWeight: 800,
                  fontSize: "var(--font-xs)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {action === "deposit" ? "DEPOSIT" : "WITHDRAW"}
              </button>
            </div>
          </div>

          <h3 style={{ fontWeight: 800, fontSize: "var(--font-xs)", marginBottom: "1rem", letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)" }}>
            FUNDING HISTORY
          </h3>
          <TransactionList txs={txs.filter((t) => ["DEPOSIT", "WITHDRAWAL"].includes(t.type))} />
        </div>
      </div>
    </div>
  );
}

function TransactionList({ txs }: { txs: Transaction[] }) {
  return (
    <div style={{ background: "var(--surface)", border: "1.5px solid var(--border-hard)", borderRadius: 0, overflow: "hidden" }}>
      {txs.length === 0 ? (
        <p style={{ padding: "2rem", color: "var(--muted)", fontSize: "var(--font-sm)", fontWeight: 700, textTransform: "uppercase" }}>[EMPTY] No transactions yet.</p>
      ) : (
        txs.map((tx, i) => (
          <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: i < txs.length - 1 ? "1.5px solid var(--border-hard)" : "none", fontSize: "var(--font-sm)" }}>
            <div>
              <div style={{ fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>{tx.type.replace("_", " ")}</div>
              <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)", marginTop: "0.25rem" }}>
                {tx.description || ""} · {new Date(tx.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div style={{
              fontWeight: 900,
              fontSize: "var(--font-lg)",
              letterSpacing: "-0.02em",
              color: tx.amount >= 0 ? "var(--success)" : "var(--accent)",
            }}>
              {tx.amount >= 0 ? "+" : "-"}₹{Math.abs(tx.amount).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function BalCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1.5px solid var(--border-hard)", borderRadius: 0, padding: "1.5rem" }}>
      <div style={{ fontSize: "var(--font-xs)", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.5rem" }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: "2rem", color, letterSpacing: "-0.04em", lineHeight: 1 }}>₹{value?.toLocaleString()}</div>
    </div>
  );
}

const errStyle: React.CSSProperties = {
  background: "rgba(196,30,30,0.08)", border: "1.5px solid var(--accent)",
  color: "var(--accent)", borderRadius: 0, padding: "0.85rem 1rem", fontSize: "var(--font-sm)", fontWeight: 700, marginBottom: "1rem", textTransform: "uppercase"
};
const successStyle: React.CSSProperties = {
  background: "rgba(26,127,60,0.08)", border: "1.5px solid var(--success)",
  color: "var(--success)", borderRadius: 0, padding: "0.85rem 1rem", fontSize: "var(--font-sm)", fontWeight: 700, marginBottom: "1rem", textTransform: "uppercase"
};
