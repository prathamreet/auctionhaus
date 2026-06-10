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
  Badge,
  Button,
  Card,
  CardHeader,
  Money,
  PageHeader,
  PageShell,
  Skeleton,
  Stat,
  StatGrid,
} from "@/components/ui";

const PREVIEW = 5;

interface BidRowData {
  id: string;
  amount: number;
  status: string;
  createdAt?: string;
  auction: { id: string; title: string; currentPrice: number; status: string };
}

interface AuctionRowData {
  id: string;
  title: string;
  status: string;
  currentPrice: number;
  endTime?: string;
  winnerId?: string | null;
  _count?: { bids: number };
}

export default function DashboardPage() {
  const { user, token } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  useSocketListener("auction:state-sync", () => {
    qc.refetchQueries({ queryKey: ["my-bids"] });
    qc.refetchQueries({ queryKey: ["my-auctions"] });
  });

  const { data: bidsData, isLoading: bidsLoading } = useQuery({
    queryKey: ["my-bids"],
    queryFn: () =>
      api
        .get("/users/me/bids")
        .then((r) => r.data.bids ?? [])
        .catch(() => []),
    enabled: !!user,
    refetchInterval: 60000,
  });
  const { data: auctionsData } = useQuery({
    queryKey: ["my-auctions"],
    queryFn: () =>
      api
        .get("/users/me/auctions")
        .then((r) => r.data.auctions ?? [])
        .catch(() => []),
    enabled: !!user,
    refetchInterval: 60000,
  });
  const { data: wonData } = useQuery({
    queryKey: ["my-won"],
    queryFn: () =>
      api
        .get("/users/me/won")
        .then((r) => r.data.auctions ?? [])
        .catch(() => []),
    enabled: !!user,
    refetchInterval: 120000,
  });

  const activeBids: BidRowData[] =
    bidsData?.filter((b: { status: string }) =>
      ["WINNING", "ACTIVE"].includes(b.status)
    ) ?? [];
  const wonBids: BidRowData[] =
    bidsData?.filter((b: { status: string }) => b.status === "WON") ?? [];

  const totalAuctions = auctionsData?.length ?? 0;
  const totalBids = bidsData?.length ?? 0;
  const totalWon = wonData?.length ?? 0;
  const isBrandNew =
    !bidsLoading && totalBids === 0 && totalAuctions === 0 && totalWon === 0;

  if (!user) return null;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Signed in as"
        title={user.name}
        subtitle={user.email}
        right={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link href="/profile" style={{ textDecoration: "none" }}>
              <Button variant="ghost" size="sm">Profile</Button>
            </Link>
            <Link href="/auctions/create" style={{ textDecoration: "none" }}>
              <Button size="sm">+ New listing</Button>
            </Link>
          </div>
        }
      />

      <StatGrid minWidth={220}>
        <Stat label="Active bids" value={activeBids.length} color="var(--accent)" />
        <Stat label="Won auctions" value={wonData?.length ?? 0} color="var(--success)" />
        <Stat label="My listings" value={auctionsData?.length ?? 0} color="var(--dutch)" />
        <Stat label="Paid out" value={wonBids.length} color="var(--text)" />
      </StatGrid>

      {isBrandNew && (
        <div
          style={{
            marginTop: "1.5rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "1.25rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "var(--font-xs)",
                fontWeight: 700,
                color: "var(--accent)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: "0.35rem",
              }}
            >
              Welcome aboard
            </div>
            <div
              style={{
                fontSize: "var(--font-md)",
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: "0.2rem",
              }}
            >
              Two quick steps to your first bid.
            </div>
            <div style={{ fontSize: "var(--font-sm)", color: "var(--text-soft)" }}>
              Fund your wallet, then open any live lot in the catalogue.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link href="/wallet" style={{ textDecoration: "none" }}>
              <Button variant="ghost" size="sm">
                Fund wallet
              </Button>
            </Link>
            <Link href="/auctions" style={{ textDecoration: "none" }}>
              <Button size="sm">Browse the market →</Button>
            </Link>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
          gap: "1.5rem",
          marginTop: "2rem",
          alignItems: "start",
        }}
      >
        <DashSection
          title="Active bids"
          items={activeBids}
          loading={bidsLoading}
          emptyMsg="No active bids. Browse the catalogue to place one."
          renderRow={(b) => <BidRow key={b.id} bid={b} />}
        />
        <DashSection
          title="My listings"
          items={(auctionsData ?? []) as AuctionRowData[]}
          loading={false}
          emptyMsg="No listings yet — start one."
          renderRow={(a) => <AuctionRow key={a.id} auction={a} />}
        />
        <DashSection
          title="Won auctions"
          items={(wonData ?? []) as AuctionRowData[]}
          loading={false}
          emptyMsg="Nothing won yet."
          renderRow={(a) => <AuctionRow key={a.id} auction={a} forceStatus="WON" />}
        />
      </div>
    </PageShell>
  );
}

function DashSection<T extends { id: string }>({
  title,
  items,
  loading,
  emptyMsg,
  renderRow,
}: {
  title: string;
  items: T[];
  loading: boolean;
  emptyMsg: string;
  renderRow: (item: T) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayed = expanded ? items : items.slice(0, PREVIEW);
  const hasMore = items.length > PREVIEW;

  return (
    <Card padding="none">
      <CardHeader
        right={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge tone="neutral">{items.length}</Badge>
            {hasMore && (
              <button
                onClick={() => setExpanded((e) => !e)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "var(--font-xs)",
                  color: "var(--accent)",
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {expanded ? "Show less" : `View all ${items.length}`}
              </button>
            )}
          </span>
        }
      >
        {title}
      </CardHeader>

      {loading ? (
        Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            style={{
              padding: "0.9rem 1.25rem",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: 12,
            }}
          >
            <Skeleton width="55%" height={14} />
            <Skeleton width="20%" height={14} />
            <Skeleton width="20%" height={14} />
          </div>
        ))
      ) : items.length === 0 ? (
        <div
          style={{
            padding: "1.5rem 1.25rem",
            fontSize: "var(--font-sm)",
            color: "var(--muted)",
          }}
        >
          {emptyMsg}
        </div>
      ) : (
        <div>{displayed.map((item) => renderRow(item))}</div>
      )}
    </Card>
  );
}

function BidRow({ bid }: { bid: BidRowData }) {
  const displayStatus =
    bid.status === "WINNING" && bid.auction?.status === "ENDED"
      ? "WON"
      : bid.status;
  const isWon = displayStatus === "WON" || displayStatus === "WINNING";

  return (
    <Link
      href={`/auctions/${bid.auction?.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        padding: "0.75rem 1.25rem",
        borderBottom: "1px solid var(--border)",
        gap: 12,
        alignItems: "center",
        color: "inherit",
        background:
          displayStatus === "WON" ? "var(--surface-2)" : "var(--surface)",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 600,
          fontSize: "var(--font-sm)",
        }}
      >
        {bid.auction?.title}
      </span>
      <Money value={bid.amount} size="sm" color="var(--accent)" />
      <Badge tone={isWon ? "success" : "neutral"}>{displayStatus}</Badge>
    </Link>
  );
}

function AuctionRow({
  auction,
  forceStatus,
}: {
  auction: AuctionRowData;
  forceStatus?: string;
}) {
  let displayStatus = forceStatus ?? auction.status;
  if (!forceStatus && auction.status === "ENDED" && !auction.winnerId) {
    displayStatus = "UNSOLD";
  }
  return (
    <Link
      href={`/auctions/${auction.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        padding: "0.75rem 1.25rem",
        borderBottom: "1px solid var(--border)",
        gap: 12,
        alignItems: "center",
        color: "inherit",
        background:
          displayStatus === "WON" ? "var(--surface-2)" : "var(--surface)",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 600,
          fontSize: "var(--font-sm)",
        }}
      >
        {auction.title}
      </span>
      <Money value={auction.currentPrice} size="sm" />
      {displayStatus === "WON" ? (
        <Badge tone="success">WON</Badge>
      ) : (
        <AuctionStatusBadge status={displayStatus} />
      )}
    </Link>
  );
}
