"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, string>;
}

const TYPE_META: Record<string, { icon: string; color: string }> = {
  OUTBID:           { icon: "⚡", color: "#ef4444" },
  AUCTION_WON:      { icon: "🏆", color: "#22c55e" },
  AUCTION_LOST:     { icon: "😔", color: "#6b7280" },
  AUCTION_STARTED:  { icon: "🟢", color: "#22c55e" },
  AUCTION_ENDED:    { icon: "🔔", color: "#f59e0b" },
  AUTO_BID_PLACED:  { icon: "🤖", color: "#6366f1" },
  PAYMENT_RECEIVED: { icon: "💰", color: "#22c55e" },
  GENERAL:          { icon: "ℹ️",  color: "#6b7280" },
};

export default function NotificationsPage() {
  const { user, token } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api
        .get("/notifications")
        .then((r) => r.data)
        .catch(() => ({ notifications: [], unreadCount: 0, total: 0 })),
    enabled: !!user,
    // No polling — socket event 'notification:new' invalidates this query in real-time (see useEffect below)
    staleTime: 60000,
  });

  // Real-time: invalidate on new notification
  useEffect(() => {
    if (!user) return;
    const sock = getSocket();
    const onNew = () => qc.refetchQueries({ queryKey: ["notifications"] });
    sock.on("notification:new", onNew);
    return () => { sock.off("notification:new", onNew); };
  }, [user, qc]);

  const markAllRead = async () => {
    await api.put("/notifications/read-all").catch(() => {});
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markRead = async (id: string) => {
    await api.put(`/notifications/${id}/read`).catch(() => {});
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const deleteN = async (id: string) => {
    await api.delete(`/notifications/${id}`).catch(() => {});
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const deleteAll = async () => {
    await api.delete("/notifications/all").catch(() => {});
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const notifications: Notification[] = data?.notifications ?? [];
  const unreadCount: number = data?.unreadCount ?? 0;

  return (
    <div style={{ maxWidth: "100%", margin: "0", padding: "4rem 4vw" }}>
      {/* ── Header ── */}
      <div
        style={{
          padding: "2rem",
          border: "1.5px solid var(--border-hard)",
          borderBottom: "none",
          background: "var(--surface)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
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
              marginBottom: "0.3rem",
            }}
          >
            Your account
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1
              style={{
                fontSize: "var(--font-2xl)",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: "var(--font-xs)",
                  fontWeight: 900,
                  padding: "0.2rem 0.55rem",
                  letterSpacing: "0.03em",
                }}
              >
                {unreadCount} unread
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                background: "none",
                border: "1.5px solid var(--border-hard)",
                color: "var(--text)",
                padding: "0.75rem 1.25rem",
                fontSize: "var(--font-xs)",
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              MARK ALL READ
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={deleteAll}
              style={{
                background: "none",
                border: "1.5px solid var(--accent)",
                color: "var(--accent)",
                padding: "0.75rem 1.25rem",
                fontSize: "var(--font-xs)",
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              DELETE ALL
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div
          style={{
            padding: "4rem",
            textAlign: "center",
            color: "var(--muted)",
            fontSize: "var(--font-sm)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Loading...
        </div>
      ) : notifications.length === 0 ? (
        <div
          style={{
            padding: "5rem 2rem",
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          <div
            style={{
              fontSize: "var(--font-sm)",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            [EMPTY] No notifications yet
          </div>
          <div
            style={{
              fontSize: "var(--font-xs)",
              marginTop: "0.4rem",
              color: "var(--muted)",
            }}
          >
            Activity from your bids and auctions will appear here.
          </div>
        </div>
      ) : (
        <div style={{ border: "1.5px solid var(--border-hard)", marginTop: "2rem" }}>
          {notifications.map((n, i) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.GENERAL;
            return (
              <div
                key={n.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "1.5rem",
                  alignItems: "center",
                  padding: "1.5rem 2rem",
                  borderBottom: i < notifications.length - 1 ? "1.5px solid var(--border-hard)" : "none",
                  background: n.isRead
                    ? "var(--surface)"
                    : "var(--surface-2)",
                  borderLeft: n.isRead
                    ? "4px solid transparent"
                    : "4px solid var(--accent)",
                  transition: "background 0.2s",
                }}
              >
                {/* Content */}
                <div>
                  <div
                    style={{
                      fontSize: "var(--font-xs)",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: meta.color,
                      marginBottom: "0.2rem",
                    }}
                  >
                    {n.type.replace(/_/g, " ")}
                  </div>
                  {n.title && (
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "var(--font-sm)",
                        marginBottom: "0.15rem",
                        color: "var(--text)",
                      }}
                    >
                      {n.title}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "var(--font-sm)",
                      color: "var(--text-soft)",
                      lineHeight: 1.5,
                    }}
                  >
                    {n.message}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--font-xs)",
                      color: "var(--muted)",
                      marginTop: "0.4rem",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {new Date(n.createdAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    paddingTop: "0.15rem",
                  }}
                >
                  {!n.isRead && (
                    <button
                      onClick={() => markRead(n.id)}
                      title="Mark as read"
                      style={actionBtn}
                    >
                      READ
                    </button>
                  )}
                  <button
                    onClick={() => deleteN(n.id)}
                    title="Delete"
                    style={{ ...actionBtn, color: "var(--accent)" }}
                  >
                    DELETE
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  background: "none",
  border: "1.5px solid var(--border-hard)",
  color: "var(--muted)",
  padding: "0.4rem 0.75rem",
  fontSize: "var(--font-xs)",
  cursor: "pointer",
  fontWeight: 800,
  letterSpacing: "0.05em",
  lineHeight: 1,
  borderRadius: 0,
  transition: "all 0.12s",
};
