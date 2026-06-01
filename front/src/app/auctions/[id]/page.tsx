"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { parseApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useAuctionRoom } from "@/lib/useSocketListener";
import { KeyDetails, InfoPanel } from "./_components/InfoPanel";
import { BidHistory } from "./_components/BidHistory";
import type { Bid, LatestLadder } from "./_components/BidHistory";
import { PricePanel, AuctionMeta } from "./_components/PricePanel";
import { CommitmentPanel } from "./_components/CommitmentPanel";
import {
  BackpressureBanner,
  PageShell,
  SkeletonCard,
  formatMoney,
  useLiveTicker,
} from "@/components/ui";

interface Auction {
  id: string;
  title: string;
  description?: string;
  type: "ENGLISH" | "DUTCH" | "SEALED_BID";
  status: string;
  currentPrice: number;
  startingPrice: number;
  reservePrice: number;
  buyNowPrice?: number;
  minIncrement: number;
  endTime: string;
  antiSnipingMins: number;
  dutchPriceStep?: number;
  dutchInterval?: number;
  autoAcceptAmount?: number;
  winnerId?: string;
  winner?: { id: string; name: string };
  seller: { id: string; name: string };
  _count?: { bids: number };
}

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [bidAmount, setBidAmount] = useState("");
  const [autoBidMax, setAutoBidMax] = useState("");
  const [bidErr, setBidErr] = useState("");
  const [bidSuccess, setBidSuccess] = useState("");
  const [bidLoading, setBidLoading] = useState(false);
  const [autoBidLoading, setAutoBidLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelAuctionLoading, setCancelAuctionLoading] = useState(false);
  const [newEndTime, setNewEndTime] = useState<string | null>(null);
  const [recentBidId, setRecentBidId] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  // Phase E8: live viewer count from auction:presence. Starts at null so we
  // don't flash "0 watching" before the server emits the first count.
  const [viewers, setViewers] = useState<number | null>(null);
  // Phase F3: latest auto-bid ladder for the ephemeral banner above the
  // bid history. Keyed by serverTs so the banner remounts (and replays its
  // entrance/fade) each time a new ladder lands.
  const [latestLadder, setLatestLadder] = useState<LatestLadder | null>(null);
  // Phase F7: latest backpressure event for the top banner. Cleared on
  // dismiss or auto-timeout (8 s, inside the banner).
  const [backpressure, setBackpressure] = useState<{
    streamLength: number;
    threshold: number;
    key: string;
  } | null>(null);
  // Phase F1: live ticker handle. Provider lives in app/providers.tsx.
  const ticker = useLiveTicker();

  const { data: auctionData, isLoading } = useQuery<Auction>({
    queryKey: ["auction", id],
    queryFn: () => api.get(`/auctions/${id}`).then((r) => r.data),
    staleTime: 0,
  });

  const { data: bidsData } = useQuery<{ bids: Bid[] }>({
    queryKey: ["auction-bids", id],
    queryFn: () => api.get(`/bids/auctions/${id}`).then((r) => r.data),
    staleTime: 0,
  });

  const { data: autoBidData } = useQuery({
    queryKey: ["auto-bid", id],
    queryFn: () =>
      api.get(`/bids/auctions/${id}/auto-bid`).then((r) => r.data ?? null).catch(() => null),
    enabled: !!user,
  });

  const { data: watchlistData } = useQuery({
    queryKey: ["watchlist-check", id],
    queryFn: () =>
      api.get("/watchlist")
        .then((r) => r.data.watchlist?.some((w: { auction: { id: string } }) => w.auction.id === id) ?? false)
        .catch(() => false),
    enabled: !!user,
  });

  const invalidate = () => {
    qc.refetchQueries({ queryKey: ["auction", id] });
    qc.refetchQueries({ queryKey: ["auction-bids", id] });
  };

  useAuctionRoom(
    id,
    {
      "bid:new": (data: unknown) => {
        const d = data as
          | { bid?: { id: string; bidderId?: string; amount?: number }; sealed?: boolean }
          | undefined;
        if (d?.bid?.id) setRecentBidId(d.bid.id);
        invalidate();
        // Phase F1: push to the live ticker -- but ONLY for bids by other
        // users. The bidder who placed the bid already sees the form's
        // success state; another toast for them would be noise.
        const isMine = d?.bid?.bidderId && user?.id && d.bid.bidderId === user.id;
        if (!isMine) {
          ticker.push({
            id: `bidnew-${d?.bid?.id ?? Date.now()}`,
            kind: "manual",
            title: d?.sealed
              ? "New sealed bid received"
              : d?.bid?.amount != null
                ? `Bid placed · ${formatMoney(d.bid.amount)}`
                : "New bid placed",
            detail: auctionData?.title,
          });
        }
        // Phase F7: dismiss backpressure banner once new bids start flowing
        // again (a successful bid:new means the stream is draining).
        setBackpressure(null);
      },
      // Phase E1: ladder steps arrive as a single `bid:ladder` event with the
      // full `steps[]`. We flash the LAST rung (the new winner) and let
      // TanStack Query refetch the bid history -- the chart renders all rungs
      // in one React commit.
      "bid:ladder": (data: unknown) => {
        const d = data as
          | {
              lastBidId?: string;
              steps?: { amount: number }[];
              finalPrice?: number;
              serverTs?: number;
            }
          | undefined;
        if (d?.lastBidId) setRecentBidId(d.lastBidId);
        invalidate();

        // Phase F3: stash the latest ladder for the ephemeral banner above
        // the bid history. We need from→to prices for the announcement;
        // derive `fromPrice` from the first rung minus the audion's
        // minIncrement (a reliable lower bound) or from the current cached
        // currentPrice as fallback.
        const rungs = d?.steps?.length ?? 0;
        if (rungs >= 1 && d?.finalPrice != null) {
          const firstRung = d.steps?.[0]?.amount ?? d.finalPrice;
          const inc = auctionData?.minIncrement ?? 0;
          const fromPrice = Math.max(0, firstRung - inc);
          setLatestLadder({
            rungs,
            fromPrice,
            toPrice: d.finalPrice,
            key: `ladder-${d.serverTs ?? Date.now()}`,
          });
        }

        // Phase F1: ticker push -- ladders of 2+ get a dedicated label,
        // single-rung ladders fold into the existing bid:new toast.
        if (rungs >= 2 && d?.finalPrice != null) {
          ticker.push({
            id: `ladder-${d.lastBidId ?? Date.now()}`,
            kind: "ladder",
            title: `Auto-bid ladder · ${rungs} rungs`,
            detail: `Settled at ${formatMoney(d.finalPrice)}`,
            serverTs: d.serverTs,
          });
        }
      },
      "auction:price-drop": () => invalidate(),
      "auction:extended": (data: unknown) => {
        const d = data as { newEndTime?: string } | undefined;
        if (d?.newEndTime) setNewEndTime(d.newEndTime);
        qc.refetchQueries({ queryKey: ["auction", id] });
        // Phase F1: anti-snipe extension is the kind of thing users miss if
        // they're focused on the bid input -- the timer just stops counting
        // down. A toast makes the cause explicit.
        ticker.push({
          id: `extended-${Date.now()}`,
          kind: "extended",
          title: "Auction extended",
          detail: "Anti-snipe — bid in the final minutes",
        });
      },
      "auction:ended": () => {
        invalidate();
        // Phase F1: clear the ticker on close so leftover toasts don't
        // linger over the WINNER / UNSOLD UI.
        ticker.clear();
      },
      "auction:started": () => invalidate(),
      // Phase E8: live viewer count.
      "auction:presence": (data: unknown) => {
        const d = data as { viewers?: number } | undefined;
        if (typeof d?.viewers === "number") setViewers(d.viewers);
      },
      // Phase F7: backpressure event from the BidSequencer. Broadcasts go
      // to the admin:fraud room today; in a future iteration each auction
      // room would also receive its own scoped warning. For now, admins on
      // the auction detail page see the banner.
      "bid:backpressure": (data: unknown) => {
        const d = data as
          | { streamLength?: number; threshold?: number }
          | undefined;
        if (d?.streamLength == null || d?.threshold == null) return;
        setBackpressure({
          streamLength: d.streamLength,
          threshold: d.threshold,
          key: `bp-${Date.now()}`,
        });
        ticker.push({
          id: `bp-${Date.now()}`,
          kind: "backpressure",
          title: "High traffic — bids may be delayed",
          detail: `${d.streamLength} pending / threshold ${d.threshold}`,
        });
      },
    },
    // Phase E9: refetch everything after a socket reconnect. While the socket
    // was down we may have missed bid:new / bid:ladder / auction:ended events,
    // so the cache is stale. The room re-join is handled inside the hook.
    () => {
      qc.refetchQueries({ queryKey: ["auction", id] });
      qc.refetchQueries({ queryKey: ["auction-bids", id] });
      qc.refetchQueries({ queryKey: ["auto-bid", id] });
    }
  );

  const placeBid = async () => {
    if (!bidAmount) return;
    setBidErr("");
    setBidSuccess("");
    const parsed = parseFloat(bidAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setBidErr("Enter a valid positive amount");
      return;
    }
    if (auctionData?.type === "ENGLISH" && auctionData.status === "ACTIVE") {
      const min = Number(auctionData.currentPrice) + Number(auctionData.minIncrement);
      if (parsed < min) {
        setBidErr(`Minimum bid: ${min.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}`);
        return;
      }
    }
    if (auctionData?.type === "SEALED_BID" && parsed <= Number(auctionData.startingPrice)) {
      setBidErr(`Bid must be above starting price`);
      return;
    }
    setBidLoading(true);
    try {
      await api.post(`/bids/auctions/${id}`, { amount: parsed });
      setBidSuccess("Bid placed");
      setBidAmount("");
      qc.invalidateQueries({ queryKey: ["auction-bids", id] });
      qc.invalidateQueries({ queryKey: ["auction", id] });
      qc.invalidateQueries({ queryKey: ["auto-bid", id] });
    } catch (e) {
      setBidErr(parseApiError(e, "Bid failed"));
    } finally {
      setBidLoading(false);
    }
  };

  const setAutoBid = async () => {
    if (!autoBidMax || autoBidLoading) return;
    setAutoBidLoading(true);
    setBidErr("");
    try {
      await api.post(`/bids/auctions/${id}/auto-bid`, { maxAmount: parseFloat(autoBidMax) });
      setBidSuccess("Auto-bid set");
      setAutoBidMax("");
      qc.invalidateQueries({ queryKey: ["auto-bid", id] });
    } catch (e) {
      setBidErr(parseApiError(e, "Auto-bid failed"));
    } finally {
      setAutoBidLoading(false);
    }
  };

  const cancelAutoBid = async () => {
    if (cancelLoading) return;
    setCancelLoading(true);
    try {
      await api.delete(`/bids/auctions/${id}/auto-bid`);
      qc.invalidateQueries({ queryKey: ["auto-bid", id] });
    } finally {
      setCancelLoading(false);
    }
  };

  const toggleWatchlist = async () => {
    if (watchlistData) {
      await api.delete(`/watchlist/${id}`).catch(() => null);
    } else {
      await api.post("/watchlist", { auctionId: id }).catch(() => null);
    }
    qc.invalidateQueries({ queryKey: ["watchlist-check", id] });
  };

  const buyNow = async () => {
    if (!confirm("Buy now at this price?")) return;
    setBidErr("");
    try {
      await api.post(`/auctions/${id}/buy-now`);
      qc.invalidateQueries({ queryKey: ["auction", id] });
    } catch (e) {
      setBidErr(parseApiError(e, "Buy now failed"));
    }
  };

  const cancelAuction = async () => {
    if (!confirm("Cancel this auction? All bids will be refunded. This cannot be undone.")) return;
    setCancelAuctionLoading(true);
    setBidErr("");
    try {
      await api.delete(`/auctions/${id}`);
      qc.invalidateQueries({ queryKey: ["auction", id] });
      setBidSuccess("Auction cancelled.");
    } catch (e) {
      setBidErr(parseApiError(e, "Cancel failed"));
    } finally {
      setCancelAuctionLoading(false);
    }
  };

  const submitRating = async () => {
    if (!ratingValue || ratingLoading) return;
    const ratedUserId = isWinner ? auctionData?.seller?.id : auctionData?.winnerId;
    if (!ratedUserId) return;
    setRatingLoading(true);
    try {
      await api.post("/users/rate", {
        rateeId: ratedUserId,
        auctionId: id,
        rating: ratingValue,
        comment: ratingComment || undefined,
      });
      setRatingDone(true);
      setBidSuccess("Rating submitted");
    } catch (e) {
      setBidErr(parseApiError(e, "Rating failed"));
    } finally {
      setRatingLoading(false);
    }
  };

  if (isLoading) {
    return (
      <PageShell>
        <div style={{ paddingTop: "2.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <SkeletonCard rows={4} />
              <SkeletonCard rows={2} />
              <SkeletonCard rows={6} />
            </div>
            <SkeletonCard rows={8} />
          </div>
        </div>
      </PageShell>
    );
  }

  if (!auctionData) {
    return (
      <PageShell>
        <div style={{ padding: "4rem 0", color: "var(--muted)" }}>
          Auction not found.
        </div>
      </PageShell>
    );
  }

  const auction = auctionData;
  const bids: Bid[] = bidsData?.bids ?? [];
  const effectiveEndTime = newEndTime ?? auction.endTime;
  const isSeller = user?.id === auction.seller?.id;
  const isWinner = user?.id === auction.winnerId;
  const isEnded = auction.status === "ENDED";
  const hasOwnSealedBid = bids.some((b) => b.bidder?.id === user?.id);
  // Phase F6: live "is the viewer currently winning?" for the AutoBidHealth
  // card. WINNING-status bid in the loaded list is the source of truth (the
  // server marks the active top bid as WINNING; outbidding flips it to
  // OUTBID inside the same tx). Falsy for SEALED_BID because the bid list
  // is masked while live -- the health card path doesn't apply (sealed
  // auctions block auto-bid anyway).
  const isViewerWinning =
    !!user &&
    auction.type !== "SEALED_BID" &&
    bids.some((b) => b.status === "WINNING" && b.bidder?.id === user.id);

  return (
    <PageShell>
      {/* Phase F7: backpressure banner above page chrome. Sticky below
          Navbar; auto-dismisses after 8 s or on manual close. */}
      {backpressure && (
        <BackpressureBanner
          key={backpressure.key}
          auctionId={auction.id}
          streamLength={backpressure.streamLength}
          threshold={backpressure.threshold}
          onDismiss={() => setBackpressure(null)}
        />
      )}

      <AuctionMeta
        type={auction.type}
        status={auction.status}
        isEnded={isEnded}
        sellerId={auction.seller?.id}
        sellerName={auction.seller?.name}
        bidCount={auction._count?.bids ?? 0}
        viewers={viewers}
      />

      <div className="grid-main-sidebar">
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Title + description */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "2rem",
            }}
          >
            <h1
              style={{
                fontSize: "clamp(1.4rem, 3vw, 2rem)",
                fontWeight: 700,
                lineHeight: 1.15,
                marginBottom: auction.description ? "0.75rem" : 0,
                letterSpacing: "-0.02em",
              }}
            >
              {auction.title}
            </h1>
            {auction.description && (
              <p
                style={{
                  color: "var(--text-soft)",
                  fontSize: "var(--font-base)",
                  lineHeight: 1.65,
                }}
              >
                {auction.description}
              </p>
            )}
          </div>

          <KeyDetails auction={auction} />

          <BidHistory
            bids={bids}
            auctionType={auction.type}
            auctionStatus={auction.status}
            startingPrice={auction.startingPrice}
            recentBidId={recentBidId}
            viewerId={user?.id}
            latestLadder={latestLadder}
          />
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <PricePanel
            auction={auction}
            effectiveEndTime={effectiveEndTime}
            viewerId={user?.id}
            isSeller={isSeller}
            isWinner={isWinner}
            isViewerWinning={isViewerWinning}
            hasOwnSealedBid={hasOwnSealedBid}
            bidAmount={bidAmount}
            setBidAmount={setBidAmount}
            autoBidMax={autoBidMax}
            setAutoBidMax={setAutoBidMax}
            bidErr={bidErr}
            bidSuccess={bidSuccess}
            bidLoading={bidLoading}
            autoBidLoading={autoBidLoading}
            cancelLoading={cancelLoading}
            cancelAuctionLoading={cancelAuctionLoading}
            watchlistData={watchlistData}
            autoBidData={autoBidData}
            onPlaceBid={placeBid}
            onSetAutoBid={setAutoBid}
            onCancelAutoBid={cancelAutoBid}
            onToggleWatchlist={toggleWatchlist}
            onBuyNow={buyNow}
            onCancelAuction={cancelAuction}
            rating={{
              value: ratingValue,
              setValue: setRatingValue,
              comment: ratingComment,
              setComment: setRatingComment,
              loading: ratingLoading,
              done: ratingDone,
              submit: submitRating,
            }}
          />
          <InfoPanel auction={auction} effectiveEndTime={effectiveEndTime} />

          {auction.type === "SEALED_BID" && (
            <CommitmentPanel
              auctionId={auction.id}
              auctionStatus={auction.status}
              startingPrice={auction.startingPrice}
              viewerId={user?.id}
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}
