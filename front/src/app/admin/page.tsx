"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useSocketListener } from "@/lib/useSocketListener";
import {
  AuctionStatusBadge,
  AuctionTypeBadge,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Money,
  PageHeader,
  PageShell,
  Select,
  Skeleton,
  Stat,
  StatGrid,
  Tabs,
} from "@/components/ui";

interface RecentUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  isSuspended: boolean;
}

interface RecentAuction {
  id: string;
  title: string;
  status: string;
  currentPrice: number;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  totalAuctions: number;
  totalBids: number;
  activeAuctions: number;
  totalRevenue: number;
  recentUsers?: RecentUser[];
  recentAuctions?: RecentAuction[];
}

type Tab = "users" | "auctions" | "fraud";

export default function AdminPage() {
  const { user, token, isHydrated } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("users");
  const [userSearch, setUserSearch] = useState("");
  const [auctionStatus, setAuctionStatus] = useState("ALL");
  const [auctionPage, setAuctionPage] = useState(1);

  useEffect(() => {
    if (!isHydrated) return;
    if (!token) {
      router.push("/login");
      return;
    }
    if (user && user.role !== "ADMIN") {
      router.push("/");
    }
  }, [token, user, router, isHydrated]);

  useSocketListener("auction:state-sync", () => {
    qc.refetchQueries({ queryKey: ["admin-stats"] });
    qc.refetchQueries({ queryKey: ["admin-auctions"] });
  });
  useSocketListener("bid:new", () => {
    qc.refetchQueries({ queryKey: ["fraud-flags"] });
  });

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => api.get("/admin/dashboard").then((r) => r.data),
    enabled: !!user && user.role === "ADMIN",
    refetchInterval: 30000,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users", userSearch],
    queryFn: () =>
      api
        .get("/admin/users", {
          params: { search: userSearch || undefined, limit: 50 },
        })
        .then((r) => r.data.users),
    enabled: !!user && user.role === "ADMIN",
  });

  const { data: adminAuctionsData, isLoading: auctionsLoading } = useQuery({
    queryKey: ["admin-auctions", auctionStatus, auctionPage],
    queryFn: () =>
      api
        .get("/admin/auctions", {
          params: {
            limit: 20,
            page: auctionPage,
            status: auctionStatus === "ALL" ? undefined : auctionStatus,
          },
        })
        .then((r) => r.data),
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

  const moderate = async (
    auctionId: string,
    action: "cancel" | "activate"
  ) => {
    if (
      action === "cancel" &&
      !confirm("Cancel this auction? All bids will be refunded.")
    )
      return;
    await api.put(`/admin/auctions/${auctionId}/moderate`, { action });
    qc.invalidateQueries({ queryKey: ["admin-auctions"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  if (!user || user.role !== "ADMIN") return null;

  const fraudCount = fraudData?.length ?? 0;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Administration"
        title="Admin panel"
        subtitle={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span className="live-dot" /> Real-time updates active
          </span>
        }
        right={
          <Link href="/admin/fraud" style={{ textDecoration: "none" }}>
            <Button variant="ghost" size="sm">Live fraud dashboard →</Button>
          </Link>
        }
      />

      {stats ? (
        <StatGrid minWidth={200}>
          <Stat label="Total users" value={stats.totalUsers} />
          <Stat label="Total auctions" value={stats.totalAuctions} color="var(--dutch)" />
          <Stat label="Active" value={stats.activeAuctions} color="var(--success)" />
          <Stat label="Total bids" value={stats.totalBids} color="var(--accent)" />
          <Stat label="Revenue" value={<Money value={stats.totalRevenue} size="lg" color="var(--success)" />} />
        </StatGrid>
      ) : (
        <StatGrid minWidth={200}>
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              style={{
                padding: "1.5rem",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
              }}
            >
              <Skeleton width="50%" height={12} />
              <div style={{ height: 12 }} />
              <Skeleton width="65%" height={26} />
            </div>
          ))}
        </StatGrid>
      )}

      {stats && (stats.recentUsers || stats.recentAuctions) && (
        <RecentActivity
          users={stats.recentUsers ?? []}
          auctions={stats.recentAuctions ?? []}
        />
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <Tabs
          items={[
            { key: "users", label: "Users", count: usersData?.length ?? 0 },
            { key: "auctions", label: "Auctions", count: adminAuctionsData?.total ?? 0 },
            { key: "fraud", label: "Fraud", count: fraudCount, countTone: "danger" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        {tab === "users" && (
          <UsersTab
            users={usersData}
            loading={usersLoading}
            search={userSearch}
            setSearch={setUserSearch}
            onToggleSuspend={toggleSuspend}
          />
        )}
        {tab === "auctions" && (
          <AuctionsTab
            auctions={adminAuctionsData?.auctions}
            loading={auctionsLoading}
            onModerate={moderate}
            status={auctionStatus}
            setStatus={(s) => {
              setAuctionStatus(s);
              setAuctionPage(1);
            }}
            page={adminAuctionsData?.page ?? 1}
            totalPages={
              adminAuctionsData
                ? Math.max(
                    1,
                    Math.ceil(adminAuctionsData.total / adminAuctionsData.limit)
                  )
                : 1
            }
            setPage={setAuctionPage}
          />
        )}
        {tab === "fraud" && (
          <FraudTab flags={fraudData} onToggleSuspend={toggleSuspend} />
        )}
      </div>
    </PageShell>
  );
}

function UsersTab({
  users,
  loading,
  search,
  setSearch,
  onToggleSuspend,
}: {
  users:
    | {
        id: string;
        name: string;
        email: string;
        role: string;
        isSuspended: boolean;
        rating?: number;
        createdAt?: string;
        _count?: { bids: number; auctions: number };
      }[]
    | undefined;
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  onToggleSuspend: (id: string, suspended: boolean) => void;
}) {
  return (
    <Card padding="none">
      <div
        style={{
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Input
          placeholder="Search users by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 480 }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 80px 120px",
          padding: "0.7rem 1.25rem",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          fontSize: "var(--font-xs)",
          fontWeight: 700,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <span>Name</span>
        <span>Email</span>
        <span style={{ textAlign: "center" }}>Role</span>
        <span style={{ textAlign: "right" }}>Action</span>
      </div>

      {loading ? (
        Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 80px 120px",
              gap: 12,
              padding: "1rem 1.25rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} width="50%" />
            <Skeleton height={14} width="60%" />
          </div>
        ))
      ) : !users || users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        users.map((u) => (
          <div
            key={u.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 80px 120px",
              alignItems: "center",
              padding: "1rem 1.25rem",
              borderBottom: "1px solid var(--border)",
              gap: 12,
              fontSize: "var(--font-sm)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Link
                  href={`/users/${u.id}`}
                  style={{ fontWeight: 600, color: "var(--text)" }}
                >
                  {u.name}
                </Link>
                {u.isSuspended && <Badge tone="danger">Suspended</Badge>}
              </div>
              <div
                style={{
                  fontSize: "var(--font-xs)",
                  color: "var(--muted)",
                  marginTop: 2,
                  display: "flex",
                  gap: "0.55rem",
                  flexWrap: "wrap",
                }}
              >
                {u._count && (
                  <span>
                    {u._count.bids} bids · {u._count.auctions} listings
                  </span>
                )}
                {typeof u.rating === "number" && u.rating > 0 && (
                  <span style={{ color: "var(--warning)", fontWeight: 700 }}>
                    ★ {u.rating.toFixed(1)}
                  </span>
                )}
                {u.createdAt && (
                  <span>
                    Joined{" "}
                    {new Date(u.createdAt).toLocaleDateString([], {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>
            <span
              style={{ color: "var(--muted)", fontSize: "var(--font-xs)" }}
            >
              {u.email}
            </span>
            <span style={{ textAlign: "center" }}>
              <Badge tone={u.role === "ADMIN" ? "accent" : "neutral"}>
                {u.role}
              </Badge>
            </span>
            <div style={{ textAlign: "right" }}>
              {u.role !== "ADMIN" && (
                <Button
                  variant={u.isSuspended ? "success" : "danger"}
                  size="sm"
                  onClick={() => onToggleSuspend(u.id, u.isSuspended)}
                >
                  {u.isSuspended ? "Unsuspend" : "Suspend"}
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function AuctionsTab({
  auctions,
  loading,
  onModerate,
  status,
  setStatus,
  page,
  totalPages,
  setPage,
}: {
  auctions:
    | {
        id: string;
        title: string;
        status: string;
        currentPrice: number;
        type: string;
        seller?: { name: string };
        _count?: { bids: number };
      }[]
    | undefined;
  loading: boolean;
  onModerate: (id: string, action: "cancel" | "activate") => void;
  status: string;
  setStatus: (s: string) => void;
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
}) {
  return (
    <Card padding="none">
      <div
        style={{
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
        }}
      >
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="ENDED">Ended</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 120px 120px 110px 180px",
          padding: "0.7rem 1.25rem",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          fontSize: "var(--font-xs)",
          fontWeight: 700,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <span>Title</span>
        <span style={{ textAlign: "right" }}>Price</span>
        <span style={{ textAlign: "center" }}>Type</span>
        <span style={{ textAlign: "center" }}>Status</span>
        <span style={{ textAlign: "right" }}>Moderate</span>
      </div>
      {loading ? (
        Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 120px 110px 180px",
              gap: 12,
              padding: "1rem 1.25rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <Skeleton height={14} />
            <Skeleton height={14} width="60%" />
            <Skeleton height={14} width="60%" />
            <Skeleton height={14} width="60%" />
            <Skeleton height={14} width="60%" />
          </div>
        ))
      ) : !auctions || auctions.length === 0 ? (
        <EmptyState title="No auctions found" />
      ) : (
        auctions.map((a) => {
          const isActive = a.status === "ACTIVE";
          const isPending = a.status === "PENDING";
          return (
            <div
              key={a.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 120px 110px 180px",
                alignItems: "center",
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                gap: 12,
                fontSize: "var(--font-sm)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Link
                  href={`/auctions/${a.id}`}
                  style={{
                    fontWeight: 600,
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--text)",
                  }}
                >
                  {a.title}
                </Link>
                <div
                  style={{
                    fontSize: "var(--font-xs)",
                    color: "var(--muted)",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  by {a.seller?.name ?? "—"} · {a._count?.bids ?? 0} bids
                </div>
              </div>
              <Money
                value={a.currentPrice}
                size="sm"
                color="var(--accent)"
                style={{ textAlign: "right" }}
              />
              <span style={{ textAlign: "center" }}>
                <AuctionTypeBadge type={a.type} />
              </span>
              <span style={{ textAlign: "center" }}>
                <AuctionStatusBadge status={a.status} />
              </span>
              <div
                style={{
                  textAlign: "right",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 6,
                }}
              >
                {isActive && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => onModerate(a.id, "cancel")}
                  >
                    Cancel
                  </Button>
                )}
                {isPending && (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => onModerate(a.id, "activate")}
                  >
                    Activate
                  </Button>
                )}
                {!isActive && !isPending && (
                  <span style={{ color: "var(--muted)" }}>—</span>
                )}
              </div>
            </div>
          );
        })
      )}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ← Prev
          </Button>
          <span
            style={{
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
              fontWeight: 600,
            }}
          >
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </Card>
  );
}

function FraudTab({
  flags,
  onToggleSuspend,
}: {
  flags:
    | {
        bidderId: string;
        user?: { name: string; email: string; isSuspended: boolean };
        outbidCount: number;
      }[]
    | undefined;
  onToggleSuspend: (id: string, suspended: boolean) => void;
}) {
  if (!flags || flags.length === 0) {
    return (
      <EmptyState
        title="No fraud flags detected"
        hint="Heuristic: more than 10 manual outbids per bidder. The live streaming detector with feature-based scoring is on the fraud dashboard."
      />
    );
  }
  return (
    <Card padding="none">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "0.7rem 1.25rem",
          background: "color-mix(in srgb, var(--danger) 8%, transparent)",
          borderBottom: "1px solid var(--border)",
          fontSize: "var(--font-xs)",
          fontWeight: 700,
          color: "var(--danger)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <span>
          {flags.length} flagged user{flags.length === 1 ? "" : "s"} (heuristic)
        </span>
        <Link
          href="/admin/fraud"
          style={{ color: "var(--danger)", fontWeight: 700 }}
        >
          Live detector →
        </Link>
      </div>
      {flags.map((f, i) => (
        <div
          key={f.bidderId}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            padding: "1rem 1.25rem",
            borderBottom:
              i < flags.length - 1 ? "1px solid var(--border)" : "none",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: "var(--font-sm)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Link href={`/users/${f.bidderId}`} style={{ color: "var(--text)" }}>
                {f.user?.name ?? "Unknown user"}
              </Link>
              {f.user?.isSuspended && <Badge tone="neutral">Suspended</Badge>}
            </div>
            <div
              style={{
                fontSize: "var(--font-xs)",
                color: "var(--muted)",
                marginTop: 2,
              }}
            >
              {f.user?.email ?? f.bidderId}
            </div>
          </div>
          <Badge tone="danger">{f.outbidCount} suspicious bids</Badge>
          {f.user && !f.user.isSuspended && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => onToggleSuspend(f.bidderId, false)}
            >
              Suspend
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}

function RecentActivity({
  users,
  auctions,
}: {
  users: RecentUser[];
  auctions: RecentAuction[];
}) {
  const headerStyle: React.CSSProperties = {
    padding: "0.7rem 1.25rem",
    background: "var(--surface-2)",
    borderBottom: "1px solid var(--border)",
    fontSize: "var(--font-xs)",
    fontWeight: 700,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
  const rowStyle = (i: number, len: number): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "0.75rem 1.25rem",
    borderBottom: i < len - 1 ? "1px solid var(--border)" : "none",
    color: "var(--text)",
  });
  const emptyStyle: React.CSSProperties = {
    padding: "1rem 1.25rem",
    fontSize: "var(--font-sm)",
    color: "var(--muted)",
  };
  const titleStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: "var(--font-sm)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))",
        gap: "1.5rem",
        marginTop: "1.5rem",
      }}
    >
      <Card padding="none">
        <div style={headerStyle}>Newest users</div>
        {users.length === 0 ? (
          <div style={emptyStyle}>No users yet</div>
        ) : (
          users.map((u, i) => (
            <Link key={u.id} href={`/users/${u.id}`} style={rowStyle(i, users.length)}>
              <div style={{ minWidth: 0 }}>
                <div style={titleStyle}>{u.name}</div>
                <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)" }}>
                  {u.email}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {u.isSuspended && <Badge tone="danger">Suspended</Badge>}
                <span style={{ fontSize: "var(--font-xs)", color: "var(--muted)" }}>
                  {new Date(u.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </Link>
          ))
        )}
      </Card>

      <Card padding="none">
        <div style={headerStyle}>Newest auctions</div>
        {auctions.length === 0 ? (
          <div style={emptyStyle}>No auctions yet</div>
        ) : (
          auctions.map((a, i) => (
            <Link
              key={a.id}
              href={`/auctions/${a.id}`}
              style={rowStyle(i, auctions.length)}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ ...titleStyle, marginBottom: 2 }}>{a.title}</div>
                <AuctionStatusBadge status={a.status} />
              </div>
              <Money value={a.currentPrice} size="sm" color="var(--accent)" />
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}
