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
  LadderBanner,
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

export interface LatestLadder {
  rungs: number;
  fromPrice: number;
  toPrice: number;
  /** Per-ladder key — when this changes, the banner remounts and replays
   *  its entrance + auto-fade animation. */
  key: string;
}

export function BidHistory({
  bids,
  auctionType,
  auctionStatus,
  startingPrice,
  recentBidId,
  viewerId,
  latestLadder,
}: {
  bids: Bid[];
  auctionType: "ENGLISH" | "DUTCH" | "SEALED_BID";
  auctionStatus: string;
  startingPrice: number;
  recentBidId: string | null;
  viewerId: string | undefined;
  /** Phase F3: latest auto-bid ladder to show in the ephemeral banner.
   *  Null = nothing to announce. */
  latestLadder?: LatestLadder | null;
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

      {/* Phase F3: ephemeral ladder-resolution banner. Keyed so each ladder
          event replays the entrance + fade animations. */}
      {latestLadder && latestLadder.rungs >= 2 && (
        <div style={{ padding: "0 1.25rem" }}>
          <LadderBanner
            key={latestLadder.key}
            rungs={latestLadder.rungs}
            fromPrice={latestLadder.fromPrice}
            toPrice={latestLadder.toPrice}
          />
        </div>
      )}

      {bids.length === 0 ? (
        <EmptyState title="No bids yet" hint="Be the first." />
      ) : isSealedLive ? (
        <SealedBidPanel bids={bids} viewerId={viewerId} />
      ) : (
        <>
          <BidChartWrap bids={bids} startingPrice={startingPrice} />
          <BidTable bids={bids} recentBidId={recentBidId} viewerId={viewerId} />
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
  viewerId,
}: {
  bids: Bid[];
  recentBidId: string | null;
  viewerId: string | undefined;
}) {
  // Phase F4: ladder grouping. A "ladder group" is a maximal run of
  // consecutive auto-bid rows (descending by amount — newest at top, so the
  // ladder appears top-to-bottom in reverse-chronological order). Each
  // group renders with a shared left-edge accent line so the user can see
  // at a glance "these 8 bids were one auto-bid resolution".
  //
  // We compute group membership in one pass over the sorted-by-amount bids:
  // a row belongs to the same group as the previous row IFF both are
  // auto-bid and were placed by different bidders within a short window
  // (≤ 1 s apart by the server-generated timestamp -- ladder rungs all
  // share one transaction commit time).
  const groupIds = React.useMemo(() => {
    const out: (number | null)[] = [];
    let curGroup = 0;
    let lastInGroup: Bid | null = null;
    for (const b of bids) {
      const eligible = b.isAutoBid;
      if (!eligible) {
        out.push(null);
        lastInGroup = null;
        continue;
      }
      if (lastInGroup) {
        const dtMs = Math.abs(
          new Date(lastInGroup.createdAt).getTime() -
            new Date(b.createdAt).getTime(),
        );
        if (dtMs <= 2000) {
          out.push(curGroup);
          lastInGroup = b;
          continue;
        }
      }
      curGroup += 1;
      out.push(curGroup);
      lastInGroup = b;
    }
    return out;
  }, [bids]);

  // Tally how many rungs belong to each group, used to render only the
  // groups with >= 2 members as ladder groups (a singleton auto-bid was a
  // standalone proxy fire, not a multi-rung resolution).
  const groupSize = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const g of groupIds) {
      if (g === null) continue;
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return counts;
  }, [groupIds]);

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
      {bids.map((b, i) => {
        const isFirst = i === 0;
        const isOwn = b.bidder?.id != null && b.bidder.id === viewerId;
        const isRecent = b.id === recentBidId;
        const groupId = groupIds[i];
        const inLadderGroup = groupId !== null && (groupSize.get(groupId) ?? 0) >= 2;

        // Phase F4: row tinting priorities.
        //   1. Winning row (top of sort) — accent tint.
        //   2. Viewer's own row — subtle muted-accent tint to make their
        //      activity easy to scan.
        //   3. Default — transparent.
        const rowBg = isFirst
          ? "color-mix(in srgb, var(--accent) 5%, transparent)"
          : isOwn
            ? "color-mix(in srgb, var(--accent-hover) 4%, transparent)"
            : "transparent";

        return (
          <div
            key={b.id}
            className={isRecent ? "ah-flash" : undefined}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              padding: "0.7rem 1.25rem",
              borderBottom: "1px solid var(--border)",
              fontSize: "var(--font-sm)",
              background: rowBg,
              alignItems: "center",
              // Phase F4: ladder accent edge.
              borderLeft: inLadderGroup
                ? "3px solid var(--accent-dark)"
                : "3px solid transparent",
              transition: "background 0.2s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Winning dot — present only on the leading row. */}
              {isFirst && (
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    flexShrink: 0,
                  }}
                />
              )}
              {/* Phase F4: distinct icon per bid kind. */}
              <BidKindIcon isAuto={b.isAutoBid} />
              <span style={{ fontWeight: isFirst || isOwn ? 700 : 500, minWidth: 0 }}>
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
              {isOwn && <Badge tone="neutral">you</Badge>}
            </div>
            <span>
              {b.amount != null ? (
                <Money
                  value={b.amount}
                  size="sm"
                  color={isFirst ? "var(--accent)" : "var(--text)"}
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
        );
      })}
    </div>
  );
}

/**
 * Phase F4 — tiny icon to make auto-bid vs manual bid scannable.
 * Pure SVG, theme-aware, no extra dependency.
 */
function BidKindIcon({ isAuto }: { isAuto: boolean }) {
  if (isAuto) {
    return (
      <span
        aria-label="auto-bid"
        title="Auto-bid"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: 4,
          background: "color-mix(in srgb, var(--accent-dark) 12%, transparent)",
          color: "var(--accent-dark)",
          fontSize: 11,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        A
      </span>
    );
  }
  return (
    <span
      aria-label="manual bid"
      title="Manual bid"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: 4,
        background: "color-mix(in srgb, var(--muted) 14%, transparent)",
        color: "var(--text-soft)",
        fontSize: 11,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      M
    </span>
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
