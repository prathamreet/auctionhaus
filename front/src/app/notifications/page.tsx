"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useSocketListener } from "@/lib/useSocketListener";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  Skeleton,
} from "@/components/ui";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, string>;
}

const TYPE_TONE: Record<
  string,
  | "neutral"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "dutch"
  | "sealed"
  | "english"
> = {
  OUTBID: "danger",
  AUCTION_WON: "success",
  AUCTION_LOST: "neutral",
  AUCTION_STARTED: "success",
  AUCTION_ENDED: "warning",
  AUTO_BID_PLACED: "accent",
  PAYMENT_RECEIVED: "success",
  GENERAL: "neutral",
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
    staleTime: 60000,
  });

  useSocketListener(
    "notification:new",
    () => qc.refetchQueries({ queryKey: ["notifications"] }),
    !!user
  );

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
    if (!confirm("Delete all notifications? This cannot be undone.")) return;
    await api.delete("/notifications/all").catch(() => {});
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const notifications: Notification[] = data?.notifications ?? [];
  const unreadCount: number = data?.unreadCount ?? 0;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Account"
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
            Notifications
            {unreadCount > 0 && (
              <Badge tone="accent">{unreadCount} unread</Badge>
            )}
          </span>
        }
        right={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="danger" size="sm" onClick={deleteAll}>
                Delete all
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <Card padding="none">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Skeleton width={80} height={14} />
              <div style={{ height: 6 }} />
              <Skeleton width="40%" height={16} />
              <div style={{ height: 6 }} />
              <Skeleton width="75%" height={12} />
            </div>
          ))}
        </Card>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          hint="Activity from your bids and auctions will show up here."
        />
      ) : (
        <Card padding="none">
          {notifications.map((n, i) => {
            const tone = TYPE_TONE[n.type] ?? "neutral";
            return (
              <div
                key={n.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "1rem",
                  alignItems: "center",
                  padding: "1.25rem 1.5rem",
                  borderBottom:
                    i < notifications.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  background: n.isRead ? "var(--surface)" : "var(--surface-2)",
                  borderLeft: n.isRead
                    ? "3px solid transparent"
                    : "3px solid var(--accent)",
                }}
              >
                <div>
                  <div style={{ marginBottom: "0.35rem" }}>
                    <Badge tone={tone}>{n.type.replace(/_/g, " ")}</Badge>
                  </div>
                  {n.title && (
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "var(--font-sm)",
                        marginBottom: "0.15rem",
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
                    }}
                  >
                    {new Date(n.createdAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  {!n.isRead && (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => markRead(n.id)}
                    >
                      Read
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => deleteN(n.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </PageShell>
  );
}
