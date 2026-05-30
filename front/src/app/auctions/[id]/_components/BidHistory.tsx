"use client";
import * as React from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  BidChart,
  type BidPoint,
  Card,
  CardHeader,
  EmptyState,
  Money,
} from "@/components/ui";

export interface Bid {
  id: string;
  amount: number | null;
  status: string;
  isAutoBid: boolean;
  bidder: { id: string; name?: string; avatar?: string } | null;
  createdAt: string;
}

export function BidHistory({
  bids,
  auctionType,
  auctionStatus,
  startingPrice,
  recentBidId,
  viewerId,
}: {
  bids: Bid[];
  auctionType: "ENGLISH" | "DUTCH" | "SEALED_BID";
  auctionStatus: string;
  startingPrice: number;
  recentBidId: string | null;
  viewerId: string | undefined;
}) {
  const isSealedLive = auctionType === "SEALED_BID" && auctionStatus === "ACTIVE";

  return (
    <Card padding="none">
      <CardHeader
        right={
          <Badge tone="neutral">
            {bids.length} {bids.length === 1 ? "entry" : "entries"}
          </Badge>
        }
      >
        Bid history
      </CardHeader>

      {bids.length === 0 ? (
        <EmptyState title="No bids yet" hint="Be the first." />
      ) : isSealedLive ? (
        <SealedBidPanel bids={bids} viewerId={viewerId} />
      ) : (
        <>
          <BidChartWrap bids={bids} startingPrice={startingPrice} />
          <BidTable bids={bids} recentBidId={recentBidId} />
        </>
      )}
    </Card>
  );
}

function BidChartWrap({
  bids,
  startingPrice,
}: {
  bids: Bid[];
  startingPrice: number;
}) {
  const points: BidPoint[] = React.useMemo(
    () =>
      bids
        .filter((b) => b.amount != null)
        .map((b) => ({
          t: new Date(b.createdAt).getTime(),
          amount: b.amount as number,
          isAutoBid: b.isAutoBid,
        })),
    [bids]
  );

  if (points.length < 2) return null;

  return (
    <div
      style={{
        padding: "1rem 1.25rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          fontSize: "var(--font-xs)",
          fontWeight: 700,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: "0.5rem",
        }}
      >
        Price over time
      </div>
      <BidChart bids={points} startingPrice={startingPrice} height={180} />
    </div>
  );
}

function BidTable({
  bids,
  recentBidId,
}: {
  bids: Bid[];
  recentBidId: string | null;
}) {
  return (
    <div style={{ maxHeight: 360, overflowY: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          padding: "0.5rem 1.25rem",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          fontSize: "var(--font-xs)",
          fontWeight: 700,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <span>Bidder</span>
        <span>Amount</span>
        <span>Time</span>
        <span>Status</span>
      </div>
      {bids.map((b, i) => (
        <div
          key={b.id}
          className={b.id === recentBidId ? "ah-flash" : undefined}
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            padding: "0.7rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            fontSize: "var(--font-sm)",
            background: i === 0 ? "color-mix(in srgb, var(--accent) 4%, transparent)" : "transparent",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i === 0 && (
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent)",
                }}
              />
            )}
            <span style={{ fontWeight: i === 0 ? 700 : 500 }}>
              {b.bidder?.id ? (
                <Link
                  href={`/users/${b.bidder.id}`}
                  style={{ color: "inherit" }}
                >
                  {b.bidder.name ?? "Anonymous"}
                </Link>
              ) : (
                b.bidder?.name ?? "Hidden"
              )}
            </span>
            {b.isAutoBid && <Badge tone="neutral">auto</Badge>}
          </div>
          <span>
            {b.amount != null ? (
              <Money
                value={b.amount}
                size="sm"
                color={i === 0 ? "var(--accent)" : "var(--text)"}
              />
            ) : (
              <Badge tone="sealed">SEALED</Badge>
            )}
          </span>
          <span
            style={{
              color: "var(--muted)",
              fontVariantNumeric: "tabular-nums",
              fontSize: "var(--font-xs)",
            }}
          >
            {new Date(b.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <span>
            <Badge
              tone={
                b.status === "WINNING" || b.status === "WON"
                  ? "success"
                  : "neutral"
              }
            >
              {b.status}
            </Badge>
          </span>
        </div>
      ))}
    </div>
  );
}

function SealedBidPanel({
  bids,
  viewerId,
}: {
  bids: Bid[];
  viewerId: string | undefined;
}) {
  const ownBid = bids.find((b) => b.bidder?.id === viewerId);
  return (
    <div style={{ padding: "1.25rem" }}>
      <Alert tone="info">
        Sealed-bid auction —{" "}
        <strong>{bids.length} bid{bids.length === 1 ? "" : "s"}</strong> received.
        Identities and amounts are hidden until the auction closes.
      </Alert>
      {ownBid && ownBid.amount != null && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.85rem 1rem",
            background: "color-mix(in srgb, var(--success) 8%, transparent)",
            border: "1px solid var(--success)",
            borderRadius: "var(--radius)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "var(--success)",
              fontWeight: 700,
              fontSize: "var(--font-xs)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Your sealed bid
          </span>
          <Money value={ownBid.amount} color="var(--success)" />
        </div>
      )}
    </div>
  );
}
