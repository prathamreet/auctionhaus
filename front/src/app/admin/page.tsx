"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";

interface AdminStats {
  totalUsers: number;
  totalAuctions: number;
  totalBids: number;
  activeAuctions: number;
  totalRevenue: number;
  recentUsers: { id: string; name: string; email: string; role: string; isSuspended: boolean; createdAt: string }[];
  recentAuctions: { id: string; title: string; status: string; currentPrice: number; type: string; endTime: string }[];
}

export default function AdminPage() {
  const { user, token, isHydrated } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"users" | "auctions" | "fraud">("users");
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    if (!isHydrated) return;
    if (!token) { router.push("/login"); return; }
    if (user && user.role !== "ADMIN") { router.push("/"); return; }
  }, [token, user, router, isHydrated]);

  // Real-time sync for admin dashboard
  useEffect(() => {
    const sock = getSocket();
    const handleSync = () => {
      qc.refetchQueries({ queryKey: ["admin-stats"] });
      qc.refetchQueries({ queryKey: ["admin-users"] });
      qc.refetchQueries({ queryKey: ["fraud-flags"] });
    };
    sock.on("auction:state-sync", handleSync);
    sock.on("bid:new", handleSync);
    return () => {
      sock.off("auction:state-sync", handleSync);
      sock.off("bid:new", handleSync);
    };
  }, [qc]);

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => api.get("/admin/dashboard").then((r) => r.data),
    enabled: !!user && user.role === "ADMIN",
    refetchInterval: 30000,
  });

  const { data: usersData } = useQuery({
    queryKey: ["admin-users", userSearch],
    queryFn: () => api.get("/admin/users", { params: { search: userSearch || undefined, limit: 50 } }).then((r) => r.data.users),
    enabled: !!user && user.role === "ADMIN",
  });

  const { data: adminAuctionsData } = useQuery({
    queryKey: ["admin-auctions"],
    queryFn: () => api.get("/admin/auctions", { params: { limit: 50 } }).then((r) => r.data.auctions),
    enabled: !!user && user.role === "ADMIN",
  });

  const { data: fraudData } = useQuery({
    queryKey: ["fraud-flags"],
    queryFn: () => api.get("/admin/fraud-flags").then((r) => r.data.flags),
    enabled: !!user && user.role === "ADMIN",
  });

  const toggleSuspend = async (userId: string, suspended: boolean) => {
    await api.put(`/admin/users/${userId}/suspend`, { suspend: !suspended });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const moderateAuction = async (auctionId: string, action: "cancel" | "activate") => {
    if (action === "cancel" && !confirm("Cancel this auction? All bids will be refunded.")) return;
    await api.put(`/admin/auctions/${auctionId}/moderate`, { action });
    qc.invalidateQueries({ queryKey: ["admin-auctions"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  if (!user || user.role !== "ADMIN") return null;

  const statItems = stats
    ? [
        { label: "Total Users", value: stats.totalUsers, color: "var(--text)" },
        { label: "Total Auctions", value: stats.totalAuctions, color: "var(--dutch)" },
        { label: "Active Auctions", value: stats.activeAuctions, color: "var(--success)" },
        { label: "Total Bids", value: stats.totalBids, color: "var(--accent)" },
        { label: "Revenue", value: `₹${stats.totalRevenue?.toLocaleString()}`, color: "var(--success)" },
      ]
    : [];

  const fraudCount = fraudData?.length ?? 0;

  return (
    <div style={{ maxWidth: "100%", margin: "0", padding: "4rem 4vw" }}>
      {/* Header */}
      <div
        style={{
          padding: "2.5rem 2rem",
          border: "1.5px solid var(--border-hard)",
          borderBottom: "none",
          background: "var(--surface)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: "1.5rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: "0.35rem",
            }}
          >
            Administration
          </div>
          <h1
            style={{
              fontSize: "var(--font-2xl)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            Admin Panel
          </h1>
        </div>
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <span className="live-dot" />
           Real-time updates active
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${statItems.length}, 1fr)`,
            border: "1.5px solid var(--border-hard)",
            borderBottom: "none",
          }}
        >
          {statItems.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: "2rem",
                borderRight: i < statItems.length - 1 ? "1.5px solid var(--border-hard)" : undefined,
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: "0.5rem",
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontSize: "2.2rem",
                  fontWeight: 900,
                  letterSpacing: "-0.04em",
                  color: typeof s.color === "string" ? s.color : "var(--text)",
                  lineHeight: 1,
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          border: "1.5px solid var(--border-hard)",
          borderBottom: "1.5px solid var(--border-hard)",
          background: "var(--surface-2)",
        }}
      >
        {(
          [
            { key: "users", label: "Users", count: usersData?.length ?? 0 },
            { key: "auctions", label: "Auctions", count: adminAuctionsData?.length ?? 0 },
            { key: "fraud", label: "Fraud Flags", count: fraudCount },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "0.85rem 1.5rem",
              fontWeight: 700,
              fontSize: "var(--font-sm)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.key ? "2.5px solid var(--accent)" : "2.5px solid transparent",
              color: activeTab === tab.key ? "var(--accent)" : "var(--muted)",
              cursor: "pointer",
              transition: "color 0.15s",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                style={{
                  background: tab.key === "fraud" && tab.count > 0 ? "var(--accent)" : "var(--border-hard)",
                  color: "#fff",
                  fontSize: "var(--font-xs)",
                  fontWeight: 900,
                  padding: "0.1rem 0.4rem",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {activeTab === "users" && (
        <div>
          {/* Search bar */}
          <div style={{ padding: "1.5rem 2rem", background: "var(--surface)", border: "1.5px solid var(--border-hard)", borderTop: "none", borderBottom: "none" }}>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="SEARCH USERS BY NAME OR EMAIL..."
              style={{ width: "100%", maxWidth: 600, borderRadius: 0, border: "1.5px solid var(--border-hard)", padding: "0.85rem 1rem", background: "var(--bg)", fontWeight: 700 }}
            />
          </div>

          <div style={{ border: "1.5px solid var(--border-hard)", borderTop: "none" }}>
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr auto 120px",
              padding: "0.85rem 2rem",
              background: "var(--surface-2)",
              borderBottom: "1.5px solid var(--border-hard)",
              fontSize: "var(--font-xs)",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            <span>Name</span>
            <span>Email</span>
            <span style={{ textAlign: "center" }}>Role</span>
            <span style={{ textAlign: "right" }}>Action</span>
          </div>

          {usersData?.map((u: { id: string; name: string; email: string; role: string; isSuspended: boolean }) => (
            <div
              key={u.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr auto 120px",
                alignItems: "center",
                padding: "1.25rem 2rem",
                borderBottom: "1.5px solid var(--border-hard)",
                background: u.isSuspended ? "rgba(196,30,30,0.04)" : "var(--surface)",
                fontSize: "var(--font-sm)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Link
                  href={`/users/${u.id}`}
                  style={{ fontWeight: 600, color: "var(--text)" }}
                >
                  {u.name}
                </Link>
                {u.isSuspended && (
                  <span
                    style={{
                      fontSize: "var(--font-xs)",
                      fontWeight: 800,
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      padding: "0 0.3rem",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    Suspended
                  </span>
                )}
              </div>
              <span style={{ color: "var(--muted)", fontSize: "var(--font-xs)" }}>{u.email}</span>
              <span
                style={{
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: u.role === "ADMIN" ? "var(--accent)" : "var(--muted)",
                  textAlign: "center",
                  minWidth: 60,
                }}
              >
                {u.role}
              </span>
              <div style={{ textAlign: "right" }}>
                {u.role !== "ADMIN" && (
                  <button
                    onClick={() => toggleSuspend(u.id, u.isSuspended)}
                    style={{
                      fontSize: "var(--font-xs)",
                      padding: "0.5rem 0.75rem",
                      border: `1.5px solid ${u.isSuspended ? "var(--success)" : "var(--accent)"}`,
                      background: "none",
                      color: u.isSuspended ? "var(--success)" : "var(--accent)",
                      cursor: "pointer",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    {u.isSuspended ? "Unsuspend" : "Suspend"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {(!usersData || usersData.length === 0) && (
            <div style={{ padding: "2.5rem 2rem", color: "var(--muted)", fontSize: "var(--font-sm)", fontWeight: 700, textTransform: "uppercase" }}>
              [EMPTY] No users found.
            </div>
          )}
          </div>
        </div>
      )}

      {/* Auctions Tab */}
      {activeTab === "auctions" && (
        <div>
          <div style={{ border: "1.5px solid var(--border-hard)", borderTop: "none" }}>
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 100px 100px 180px",
              padding: "0.85rem 2rem",
              background: "var(--surface-2)",
              borderBottom: "1.5px solid var(--border-hard)",
              fontSize: "var(--font-xs)",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            <span>Title</span>
            <span style={{ textAlign: "right" }}>Price</span>
            <span style={{ textAlign: "center" }}>Type</span>
            <span style={{ textAlign: "center" }}>Status</span>
            <span style={{ textAlign: "right" }}>Moderate</span>
          </div>

          {adminAuctionsData?.map((a: { id: string; title: string; status: string; currentPrice: number; type: string }) => {
            const typeLabel: Record<string, string> = { ENGLISH: "English", DUTCH: "Dutch", SEALED_BID: "Sealed" };
            const isActive = a.status === "ACTIVE";
            const isPending = a.status === "PENDING";
            return (
              <div
                key={a.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 100px 100px 180px",
                  alignItems: "center",
                  padding: "1.25rem 2rem",
                  borderBottom: "1.5px solid var(--border-hard)",
                  background: "var(--surface)",
                  fontSize: "var(--font-sm)",
                }}
              >
                <Link
                  href={`/auctions/${a.id}`}
                  style={{
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--text)",
                  }}
                >
                  {a.title}
                </Link>
                <span
                  style={{
                    fontWeight: 700,
                    color: "var(--accent)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ₹{a.currentPrice?.toLocaleString()}
                </span>
                <span
                  style={{
                    fontSize: "var(--font-xs)",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  {typeLabel[a.type] ?? a.type}
                </span>
                <span
                  style={{
                    fontSize: "var(--font-xs)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: isActive ? "var(--success)" : isPending ? "var(--warning)" : "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  {a.status}
                </span>
                <div style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
                  {isActive && (
                    <button
                      onClick={() => moderateAuction(a.id, "cancel")}
                      style={{
                        fontSize: "var(--font-xs)",
                        padding: "0.5rem 0.75rem",
                        border: "1.5px solid var(--accent)",
                        background: "none",
                        color: "var(--accent)",
                        cursor: "pointer",
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  {isPending && (
                    <button
                      onClick={() => moderateAuction(a.id, "activate")}
                      style={{
                        fontSize: "var(--font-xs)",
                        padding: "0.5rem 0.75rem",
                        border: "1.5px solid var(--success)",
                        background: "none",
                        color: "var(--success)",
                        cursor: "pointer",
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      Activate
                    </button>
                  )}
                  {!isActive && !isPending && (
                    <span style={{ fontSize: "var(--font-xs)", color: "var(--muted)" }}>—</span>
                  )}
                </div>
              </div>
            );
          })}

          {(!adminAuctionsData || adminAuctionsData.length === 0) && (
            <div style={{ padding: "2.5rem 2rem", color: "var(--muted)", fontSize: "var(--font-sm)", fontWeight: 700, textTransform: "uppercase" }}>
              [EMPTY] No auctions found.
            </div>
          )}
          </div>
        </div>
      )}

      {/* Fraud Flags Tab */}
      {activeTab === "fraud" && (
        <div>
          {fraudData && fraudData.length > 0 ? (
            <div style={{ border: "1.5px solid var(--border-hard)", borderTop: "none" }}>
              <div
                style={{
                  padding: "0.85rem 2rem",
                  background: "rgba(196,30,30,0.05)",
                  borderBottom: "1.5px solid var(--border-hard)",
                  fontSize: "var(--font-xs)",
                  color: "var(--accent)",
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                {fraudCount} flagged {fraudCount === 1 ? "user" : "users"} detected
              </div>
              {fraudData.map(
                (f: {
                  bidderId: string;
                  bidder: { name: string; email: string };
                  _count: { id: number };
                }) => (
                  <div
                    key={f.bidderId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      padding: "1.25rem 2rem",
                      borderBottom: "1.5px solid var(--border-hard)",
                      background: "var(--surface)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "var(--font-sm)" }}>
                        {f.bidder?.name}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--font-xs)",
                          color: "var(--muted)",
                          marginTop: "0.1rem",
                        }}
                      >
                        {f.bidder?.email}
                      </div>
                    </div>
                    <div
                      style={{
                        color: "var(--accent)",
                        fontWeight: 800,
                        fontSize: "var(--font-sm)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <span
                        style={{
                          background: "var(--accent)",
                          color: "#fff",
                          fontSize: "var(--font-xs)",
                          fontWeight: 900,
                          padding: "0.15rem 0.45rem",
                        }}
                      >
                        {f._count?.id}
                      </span>
                      suspicious bids
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div
              style={{
                padding: "4rem 2rem",
                textAlign: "center",
                color: "var(--muted)",
                background: "var(--surface)",
                border: "1.5px solid var(--border-hard)",
                borderTop: "none"
              }}
            >
              <div
                style={{
                  fontSize: "var(--font-sm)",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: "0.3rem",
                  color: "var(--success)",
                }}
              >
                [CLEAR] No fraud flags detected
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
