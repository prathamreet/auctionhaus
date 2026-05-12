"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import api, { parseApiError } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";

interface Bid {
  id: string;
  amount: number;
  status: string;
  isAutoBid: boolean;
  bidder: { id: string; name: string };
  createdAt: string;
}

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

function Countdown({ endTime }: { endTime: string }) {
  const [left, setLeft] = useState({ text: "", urgent: false });

  useEffect(() => {
    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) {
        setLeft({ text: "Ended", urgent: false });
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const text = d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
      setLeft({ text, urgent: diff < 3600000 });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return (
    <span
      className={`timer-display${left.urgent ? " urgent" : ""}`}
      style={{ fontSize: "2.2rem" }}
    >
      {left.text}
    </span>
  );
}

export default function AuctionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [bidAmount, setBidAmount] = useState("");
  const [autoBidMax, setAutoBidMax] = useState("");
  const [bidErr, setBidErr] = useState("");
  const [bidSuccess, setBidSuccess] = useState("");
  const [bidLoading, setBidLoading] = useState(false);
  const [autoBidLoading, setAutoBidLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [newEndTime, setNewEndTime] = useState<string | null>(null);
  const [recentBidId, setRecentBidId] = useState<string | null>(null);

  const { data: auctionData, isLoading } = useQuery<Auction>({
    queryKey: ["auction", id],
    queryFn: () => api.get(`/auctions/${id}`).then((r) => r.data),
    staleTime: 0, // Socket-driven — always re-fetch on invalidation
  });

  const { data: bidsData } = useQuery<{ bids: Bid[] }>({
    queryKey: ["auction-bids", id],
    queryFn: () => api.get(`/bids/auctions/${id}`).then((r) => r.data),
    staleTime: 0, // Socket-driven — always re-fetch on invalidation
  });


  const { data: autoBidData } = useQuery({
    queryKey: ["auto-bid", id],
    queryFn: () =>
      api
        .get(`/bids/auctions/${id}/auto-bid`)
        .then((r) => r.data ?? null)
        .catch(() => null),
    enabled: !!user,
  });

  const { data: watchlistData } = useQuery({
    queryKey: ["watchlist-check", id],
    queryFn: () =>
      api
        .get("/watchlist")
        .then((r) =>
          r.data.watchlist?.some(
            (w: { auction: { id: string } }) => w.auction.id === id
          ) ?? false
        )
        .catch(() => false),
    enabled: !!user,
  });

  // Socket.io real-time
  useEffect(() => {
    const sock = getSocket();
    sock.emit("auction:join", id);

    const onBidNew = (data: { bid?: { id: string } }) => {
      if (data?.bid?.id) setRecentBidId(data.bid.id);
      // refetchQueries forces immediate network fetch (not just marking stale)
      qc.refetchQueries({ queryKey: ["auction-bids", id] });
      qc.refetchQueries({ queryKey: ["auction", id] });
    };
    const onExtended = (data: { newEndTime: string }) => {
      setNewEndTime(data.newEndTime);
      qc.refetchQueries({ queryKey: ["auction", id] });
    };
    const onStateChange = () => {
      qc.refetchQueries({ queryKey: ["auction", id] });
      qc.refetchQueries({ queryKey: ["auction-bids", id] });
    };

    sock.on("bid:new", onBidNew);
    sock.on("auction:extended", onExtended);
    sock.on("auction:price-drop", onBidNew);
    sock.on("auction:ended", onStateChange);
    sock.on("auction:started", onStateChange);

    return () => {
      sock.emit("auction:leave", id);
      sock.off("bid:new", onBidNew);
      sock.off("auction:extended", onExtended);
      sock.off("auction:price-drop", onBidNew);
      sock.off("auction:ended", onStateChange);
      sock.off("auction:started", onStateChange);
    };
  }, [id, qc]);

  const placeBid = useCallback(async () => {
    if (!bidAmount) return;
    setBidErr("");
    setBidSuccess("");

    const parsed = parseFloat(bidAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setBidErr("Enter a valid positive amount");
      return;
    }

    // Client-side validation: English auctions require currentPrice + minIncrement
    if (auctionData && auctionData.type === "ENGLISH" && auctionData.status === "ACTIVE") {
      const minRequired = Number(auctionData.currentPrice) + Number(auctionData.minIncrement);
      if (parsed < minRequired) {
        setBidErr(`Bid must be at least \u20B9${minRequired.toLocaleString()}`);
        return;
      }
    }

    // Sealed bid: must be above starting price
    if (auctionData && auctionData.type === "SEALED_BID") {
      if (parsed <= Number(auctionData.startingPrice)) {
        setBidErr(`Bid must be above \u20B9${Number(auctionData.startingPrice).toLocaleString()}`);
        return;
      }
    }

    setBidLoading(true);
    try {
      await api.post(`/bids/auctions/${id}`, { amount: parsed });
      setBidSuccess("Bid placed successfully!");
      setBidAmount("");
      qc.invalidateQueries({ queryKey: ["auction-bids", id] });
      qc.invalidateQueries({ queryKey: ["auction", id] });
      qc.invalidateQueries({ queryKey: ["auto-bid", id] });
    } catch (e: unknown) {
      setBidErr(parseApiError(e, "Bid failed"));
    } finally {
      setBidLoading(false);
    }
  }, [bidAmount, id, qc, auctionData]);

  const setAutoBid = async () => {
    if (!autoBidMax || autoBidLoading) return;
    setAutoBidLoading(true);
    setBidErr("");
    try {
      await api.post(`/bids/auctions/${id}/auto-bid`, {
        maxAmount: parseFloat(autoBidMax),
      });
      setBidSuccess("Auto-bid activated!");
      setAutoBidMax("");
      qc.invalidateQueries({ queryKey: ["auto-bid", id] });
    } catch (e: unknown) {
      setBidErr(parseApiError(e, "Failed to set auto-bid"));
    } finally {
      setAutoBidLoading(false);
    }
  };

  const cancelAutoBid = async () => {
    if (cancelLoading) return; // prevent double-click spam
    setCancelLoading(true);
    try {
      await api.delete(`/bids/auctions/${id}/auto-bid`);
      qc.invalidateQueries({ queryKey: ["auto-bid", id] });
    } catch {
      /* ignore */
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
    } catch (e: unknown) {
      setBidErr(parseApiError(e, "Buy now failed"));
    }
  };

  // ── Seller: Cancel own auction ──
  const [cancelAuctionLoading, setCancelAuctionLoading] = useState(false);
  const cancelAuction = async () => {
    if (!confirm("Are you sure you want to cancel this auction? This cannot be undone.")) return;
    setCancelAuctionLoading(true);
    setBidErr("");
    try {
      await api.delete(`/auctions/${id}`);
      qc.invalidateQueries({ queryKey: ["auction", id] });
      setBidSuccess("Auction cancelled successfully.");
    } catch (e: unknown) {
      setBidErr(parseApiError(e, "Failed to cancel auction"));
    } finally {
      setCancelAuctionLoading(false);
    }
  };

  // ── Rate user (winner rates seller, seller rates winner) ──
  const [ratingValue, setRatingValue] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const submitRating = async () => {
    if (!ratingValue || ratingLoading) return;
    const ratedUserId = isWinner ? auctionData?.seller?.id : auctionData?.winnerId;
    if (!ratedUserId) return;
    setRatingLoading(true);
    setBidErr("");
    try {
      await api.post("/users/rate", {
        rateeId: ratedUserId,
        auctionId: id,
        rating: ratingValue,
        comment: ratingComment || undefined,
      });
      setRatingDone(true);
      setBidSuccess("Rating submitted!");
    } catch (e: unknown) {
      setBidErr(parseApiError(e, "Failed to submit rating"));
    } finally {
      setRatingLoading(false);
    }
  };

  const [paymentStatus, setPaymentStatus] = useState<null | "settled" | "checking" | "not_settled">(null);

  // Check if payment has already been auto-settled by escrow
  useEffect(() => {
    const isEndedNow = auctionData?.status === "ENDED";
    const isWinnerNow = !!user && user.id === auctionData?.winnerId;
    const isSellerNow = !!user && user.id === auctionData?.seller?.id;
    if (isEndedNow && (isWinnerNow || isSellerNow) && paymentStatus === null) {
      setPaymentStatus("checking");
      api.get(`/wallet/transactions`).then((r) => {
        const transactions: Array<{ referenceId?: string; type: string }> = r.data?.transactions ?? [];
        const settled = transactions.some(
          (t) => t.referenceId === id && t.type === "PAYMENT"
        );
        setPaymentStatus(settled ? "settled" : "not_settled");
      }).catch(() => setPaymentStatus("not_settled"));
    }
  }, [auctionData?.status, auctionData?.winnerId, auctionData?.seller?.id, user, id, paymentStatus]);

  if (isLoading)
    return (
      <div
        style={{
          padding: "5rem 2rem",
          textAlign: "center",
          color: "var(--muted)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          fontSize: "var(--font-sm)",
        }}
      >
        Loading lot...
      </div>
    );
  if (!auctionData)
    return (
      <div style={{ padding: "3rem", color: "var(--muted)" }}>
        Auction not found.
      </div>
    );

  const auction = auctionData;
  const bids: Bid[] = bidsData?.bids ?? [];
  const effectiveEndTime = newEndTime ?? auction.endTime;
  const isSeller = user?.id === auction.seller?.id;
  const isWinner = user?.id === auction.winnerId;
  const canBid = user && !isSeller && auction.status === "ACTIVE";
  const isEnded = auction.status === "ENDED";

  const typeLabel: Record<string, string> = {
    ENGLISH: "English",
    DUTCH: "Dutch",
    SEALED_BID: "Sealed Bid",
  };
  const typeBadgeClass: Record<string, string> = {
    ENGLISH: "badge badge-english",
    DUTCH: "badge badge-dutch",
    SEALED_BID: "badge badge-sealed",
  };

  return (
    <div style={{ width: "100%", margin: "0", padding: "0 4vw 4vw", minHeight: "100vh" }}>
      {/* ── Page Header Strip ── */}
      <div
        style={{
          padding: "3rem 0 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span className={typeBadgeClass[auction.type]}>
            {typeLabel[auction.type]}
          </span>
          <span
            className={`badge ${isEnded ? "badge-ended" : "badge-active"}`}
          >
            {auction.status}
          </span>
          {!isEnded && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "var(--font-xs)",
                color: "var(--accent)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <span className="live-dot" />
              &nbsp;Live
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Seller:{" "}
          <Link
            href={`/users/${auction.seller?.id}`}
            style={{ color: "var(--text)", fontWeight: 700 }}
          >
            {auction.seller?.name}
          </Link>
          &nbsp;·&nbsp;
          {auction._count?.bids ?? 0} total bids
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(600px, 1fr))",
          gap: "1.5rem",
          minHeight: "calc(100vh - var(--navbar-h) - 60px)",
        }}
      >
        {/* ── LEFT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Title block */}
          <div
            style={{
              padding: "2.5rem 2rem",
              border: "1.5px solid var(--border-hard)",
              background: "var(--surface)",
            }}
          >
            <h1
              style={{
                fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                marginBottom: "1rem",
                color: "var(--text)",
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

          {/* Key details grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              border: "1.5px solid var(--border-hard)",
              background: "var(--surface)",
            }}
          >
            {(auction.type === "DUTCH"
              ? [
                  { label: "Starting Price", value: `₹${auction.startingPrice?.toLocaleString()}` },
                  { label: "Reserve Price", value: auction.reservePrice ? `₹${auction.reservePrice?.toLocaleString()}` : "—" },
                  { label: "Drop Step", value: auction.dutchPriceStep ? `₹${auction.dutchPriceStep?.toLocaleString()}` : "—" },
                  { label: "Interval", value: auction.dutchInterval ? `${auction.dutchInterval}s` : "—" },
                ]
              : [
                  { label: "Starting Price", value: `₹${auction.startingPrice?.toLocaleString()}` },
                  { label: "Reserve Price", value: auction.reservePrice ? `₹${auction.reservePrice?.toLocaleString()}` : "—" },
                  { label: "Min Increment", value: `₹${auction.minIncrement}` },
                  {
                    label: "Buy Now",
                    value: auction.buyNowPrice
                      ? `₹${auction.buyNowPrice?.toLocaleString()}`
                      : "—",
                  },
                ]
            ).map((item, i) => (
              <div
                key={item.label}
                style={{
                  padding: "1rem 1.25rem",
                  borderRight:
                    i < 3 ? "1px solid var(--border)" : undefined,
                }}
              >
                <div className="price-label" style={{ marginBottom: "0.3rem" }}>
                  {item.label}
                </div>
                <div style={{ fontWeight: 700, fontSize: "var(--font-base)" }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* ── Bid History ── */}
          <div style={{ border: "1.5px solid var(--border-hard)", background: "var(--surface)" }}>
            <div
              style={{
                padding: "1.25rem 2rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1.5px solid var(--border-hard)",
                background: "var(--surface-2)",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "var(--font-sm)",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                }}
              >
                Bid History
              </span>
              <span
                style={{
                  fontSize: "var(--font-xs)",
                  color: "var(--muted)",
                  fontWeight: 600,
                }}
              >
                {bids.length} entries
              </span>
            </div>

            {bids.length === 0 ? (
              <div
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: "var(--font-sm)",
                  letterSpacing: "0.04em",
                }}
              >
                No bids placed yet. Be the first.
              </div>
            ) : auction.type === "SEALED_BID" && auction.status === "ACTIVE" ? (
              // ── Sealed bid privacy card ──
              <div style={{ padding: "1.5rem" }}>
                <div
                  style={{
                    background: "rgba(100,80,200,0.06)",
                    border: "1.5px solid rgba(120,80,220,0.25)",
                    padding: "1.25rem",
                    borderRadius: 0,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: "var(--font-sm)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text)", marginBottom: "0.35rem" }}>
                    [PRIVATE] {bids.length} Sealed {bids.length === 1 ? "Bid" : "Bids"}
                  </div>
                  <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)", lineHeight: 1.6 }}>
                    All bids are private until the auction ends. Bidder identities and amounts are hidden.
                  </div>
                  {/* Show the requester's own bid if they have one */}
                  {bids.filter((b) => b.bidder?.id === user?.id).map((b) => (
                    <div
                      key={b.id}
                      style={{
                        marginTop: "1rem",
                        padding: "1rem",
                        background: "var(--surface-2)",
                        border: "1.5px solid var(--success)",
                        fontSize: "var(--font-sm)",
                        color: "var(--success)",
                        fontWeight: 700,
                      }}
                    >
                      [LOGGED] Your sealed bid: ₹{b.amount?.toLocaleString() ?? "—"}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {/* Table header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 1fr",
                    padding: "0.5rem 1.5rem",
                    background: "var(--surface-2)",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "var(--font-xs)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
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
                    className={b.id === recentBidId ? "bid-row-new" : ""}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 1fr",
                      padding: "0.7rem 1.5rem",
                      borderBottom: "1px solid var(--border)",
                      fontSize: "var(--font-base)",
                      background: i === 0 ? "rgba(196,30,30,0.04)" : "var(--surface)",
                      transition: "background 0.3s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
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
                      <span style={{ fontWeight: i === 0 ? 700 : 400 }}>
                        {b.bidder?.id
                          ? <Link href={`/users/${b.bidder.id}`} style={{ color: "inherit" }}>{b.bidder?.name}</Link>
                          : (b.bidder?.name ?? "Hidden")}
                      </span>
                      {b.isAutoBid && (
                        <span
                          style={{
                            fontSize: "var(--font-xs)",
                            color: "var(--muted)",
                            border: "1px solid var(--border)",
                            padding: "0 0.3rem",
                          }}
                        >
                          auto
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        color: i === 0 ? "var(--accent)" : "var(--text)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {b.amount != null ? `₹${b.amount?.toLocaleString()}` : "[SEALED]"}
                    </span>
                    <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                      {new Date(b.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color:
                          b.status === "WINNING" || b.status === "WON"
                            ? "var(--success)"
                            : "var(--muted)",
                        fontSize: "var(--font-xs)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {b.status}
                    </span>
                  </div>
                ))}

              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* ── Price Panel ── */}
          <div
            style={{
              border: "1.5px solid var(--border-hard)",
              padding: "2rem",
              background: "var(--surface)",
            }}
          >
            <div className="price-label" style={{ marginBottom: "0.4rem" }}>
              {isEnded ? "Final Price" : "Current Bid"}
            </div>
            <div className="price-tag" style={{ marginBottom: "1.25rem" }}>
              ₹{auction.currentPrice?.toLocaleString()}
            </div>

            {!isEnded && (
              <div
                style={{
                  padding: "0.85rem 1rem",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  marginBottom: "1.25rem",
                }}
              >
                <div
                  className="price-label"
                  style={{
                    marginBottom: "0.35rem",
                    color: "var(--muted)",
                  }}
                >
                  Time Remaining
                </div>
                <Countdown endTime={effectiveEndTime} />
              </div>
            )}

            {isEnded && (
              <div
                style={{
                  padding: "1.25rem",
                  background: auction.winner
                    ? (isWinner ? "rgba(26,127,60,0.08)" : "rgba(26,127,60,0.04)")
                    : "var(--surface-2)",
                  border: `1.5px solid ${auction.winner ? "var(--success)" : "var(--border)"}`,
                  marginBottom: "1.25rem",
                }}
              >
                {auction.winner ? (
                  <div>
                    <div style={{
                      fontSize: "var(--font-xs)",
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--success)",
                      marginBottom: "0.5rem",
                    }}>
                      {isWinner ? "You Won This Auction" : isSeller ? "Sold" : "Winner Announced"}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "var(--font-sm)" }}>
                      {isWinner ? (
                        <span>Congratulations! You won for <span style={{ color: "var(--success)", fontWeight: 800 }}>₹{auction.currentPrice?.toLocaleString()}</span></span>
                      ) : (
                        <>
                          <Link href={`/users/${auction.winner.id}`} style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}>{auction.winner.name}</Link>
                          <span style={{ color: "var(--muted)", fontWeight: 400 }}> won for </span>
                          <span style={{ color: "var(--success)", fontWeight: 800 }}>₹{auction.currentPrice?.toLocaleString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{
                      fontSize: "var(--font-xs)",
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      marginBottom: "0.3rem",
                    }}>
                      Auction Ended
                    </div>
                    <span style={{ fontWeight: 700, fontSize: "var(--font-sm)", color: "var(--muted)" }}>UNSOLD — reserve not met or no bids</span>
                  </div>
                )}
              </div>
            )}



            {isEnded && (isWinner || isSeller) && ((): React.ReactNode => {
              const winnerName = auction.winner?.name ?? auction.seller?.name ?? "Winner";
              const verificationCode = `AH-${auction.id.slice(0, 8).toUpperCase()}-${new Date(auction.endTime).getFullYear()}`;
              return (
                <div
                  style={{
                    marginBottom: "1rem",
                    border: isWinner ? "2px solid var(--success)" : "2px solid var(--accent)",
                    background: isWinner
                      ? "rgba(26,127,60,0.05)"
                      : "rgba(196,30,30,0.04)",
                    padding: "1.25rem",
                  }}
                >
                  {/* Trophy header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.85rem",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: "var(--font-sm)",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: isWinner ? "var(--success)" : "var(--accent)",
                        }}
                      >
                        {isWinner ? "You Won!" : "Auction Winner"}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--font-xs)",
                          color: "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        {isSeller ? "Show this to verify the winner" : "Show this to the seller"}
                      </div>
                    </div>
                  </div>

                  {/* Certificate body */}
                  <div
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      padding: "0.85rem",
                      marginBottom: "0.85rem",
                      fontSize: "var(--font-xs)",
                    }}
                  >
                    <div style={{ marginBottom: "0.5rem" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 600 }}>Winner: </span>
                      <span style={{ fontWeight: 800, fontSize: "var(--font-sm)" }}>{winnerName}</span>
                    </div>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 600 }}>Item: </span>
                      <span style={{ fontWeight: 700 }}>{auction.title}</span>
                    </div>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 600 }}>Winning Bid: </span>
                      <span style={{ fontWeight: 800, color: isWinner ? "var(--success)" : "var(--accent)", fontSize: "var(--font-sm)" }}>
                        ₹{auction.currentPrice?.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 600 }}>Date: </span>
                      <span style={{ fontWeight: 600 }}>
                        {new Date(auction.endTime).toLocaleDateString([], { dateStyle: "long" })}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: "0.75rem",
                        paddingTop: "0.65rem",
                        borderTop: "1px solid var(--border)",
                        fontFamily: "monospace",
                        letterSpacing: "0.1em",
                        fontWeight: 700,
                        fontSize: "var(--font-sm)",
                        color: "var(--muted)",
                      }}
                    >
                      {verificationCode}
                    </div>
                  </div>

                  {/* Payment & delivery status */}
                  {!isWinner && (
                    <div style={{ marginBottom: "0.75rem" }}>
                      <div
                        style={{
                          padding: "1rem",
                          background: "var(--surface-2)",
                          border: "1.5px solid var(--success)",
                          color: "var(--success)",
                          fontSize: "var(--font-xs)",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <span>Payment Auto-Settled (Escrow)</span>
                      </div>
                      {/* Delivery steps */}
                      <div
                        style={{
                          background: "var(--surface-2)",
                          border: "1.5px solid var(--border-hard)",
                          padding: "1rem",
                          fontSize: "var(--font-xs)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            marginBottom: "0.5rem",
                            color: "var(--muted)",
                          }}
                        >
                          DELIVERY STEPS
                        </div>
                        <ol style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.7, color: "var(--text-soft)" }}>
                          <li>₹{auction.currentPrice?.toLocaleString()} has been credited to your wallet</li>
                          <li>Winner will contact you with their verification code</li>
                          <li>Verify the code matches: <strong style={{ fontFamily: "monospace", color: "var(--accent)" }}>{`AH-${auction.id.slice(0, 8).toUpperCase()}`}</strong></li>
                          <li>Arrange delivery or pick-up, then mark complete</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}



            {/* ── BID FORM ── */}
            {canBid && auction.type !== "DUTCH" && (
              <div>
                {/* Sealed bid notice */}
                {auction.type === "SEALED_BID" && (
                  <div
                    style={{
                      padding: "1rem",
                      background: "var(--surface-2)",
                      border: "1.5px solid var(--border-hard)",
                      fontSize: "var(--font-xs)",
                      color: "var(--muted)",
                      marginBottom: "0.75rem",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>[PRIVATE]</strong> Sealed bid — your bid is private. One bid per user; submitting again will update your bid.
                  </div>
                )}
                {bidErr && (
                  <div
                    style={{
                      padding: "0.65rem 0.85rem",
                      background: "rgba(196,30,30,0.08)",
                      border: "1.5px solid var(--accent)",
                      color: "var(--accent)",
                      fontSize: "var(--font-sm)",
                      fontWeight: 600,
                      marginBottom: "0.75rem",
                    }}
                  >
                    {bidErr}
                  </div>
                )}
                {bidSuccess && (
                  <div
                    style={{
                      padding: "0.65rem 0.85rem",
                      background: "rgba(26,127,60,0.08)",
                      border: "1.5px solid var(--success)",
                      color: "var(--success)",
                      fontSize: "var(--font-sm)",
                      fontWeight: 600,
                      marginBottom: "0.75rem",
                    }}
                  >
                    {bidSuccess}
                  </div>
                )}

                <div style={{ display: "flex", gap: "0", marginBottom: "0.5rem" }}>
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={
                      auction.type === "SEALED_BID"
                        ? `Above ₹${Number(auction.startingPrice)?.toLocaleString()}`
                        : `Min ₹${(Number(auction.currentPrice) + Number(auction.minIncrement)).toLocaleString()}`
                    }
                    style={{
                      flex: 1,
                      border: "1.5px solid var(--border-hard)",
                      borderRight: "none",
                      borderRadius: 0,
                    }}
                    onKeyDown={(e) => e.key === "Enter" && placeBid()}
                  />
                  <button
                    onClick={placeBid}
                    disabled={bidLoading}
                    className="btn-primary"
                    style={{ whiteSpace: "nowrap", borderRadius: 0 }}
                  >
                    {bidLoading
                      ? "..."
                      : auction.type === "SEALED_BID"
                      ? (bidsData?.bids?.some((b) => b.bidder?.id === user?.id) ? "Update Sealed Bid" : "Submit Sealed Bid")
                      : "Place Bid"}
                  </button>
                </div>
                {auction.type !== "SEALED_BID" && (
                  <div
                    style={{
                      fontSize: "var(--font-xs)",
                      color: "var(--muted)",
                      letterSpacing: "0.03em",
                    }}
                  >
                    Minimum next bid: ₹
                    {(Number(auction.currentPrice) + Number(auction.minIncrement)).toLocaleString()}
                  </div>
                )}
              </div>
            )}


            {canBid && auction.type === "DUTCH" && (
              <div>
                {bidErr && (
                  <div
                    style={{
                      padding: "0.65rem",
                      background: "rgba(196,30,30,0.08)",
                      border: "1.5px solid var(--accent)",
                      color: "var(--accent)",
                      fontSize: "var(--font-sm)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {bidErr}
                  </div>
                )}
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    background: "rgba(26,111,168,0.08)",
                    border: "1px solid var(--dutch)",
                    marginBottom: "0.75rem",
                    fontSize: "var(--font-sm)",
                    color: "var(--dutch)",
                    fontWeight: 600,
                  }}
                >
                  Dutch auction — price drops over time. Accept current price to win.
                </div>
                <button
                  onClick={() => {
                    setBidAmount(String(auction.currentPrice));
                    placeBid();
                  }}
                  disabled={bidLoading}
                  style={{
                    background: "var(--dutch)",
                    color: "#fff",
                    border: "none",
                    padding: "0.75rem",
                    fontWeight: 700,
                    fontSize: "var(--font-base)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    width: "100%",
                    cursor: bidLoading ? "not-allowed" : "pointer",
                  }}
                >
                  Accept ₹{auction.currentPrice?.toLocaleString()} →
                </button>
              </div>
            )}

            {auction.buyNowPrice && canBid && (
              <button
                onClick={buyNow}
                style={{
                  background: "var(--success)",
                  color: "#fff",
                  border: "none",
                  padding: "0.65rem",
                  fontWeight: 700,
                  fontSize: "var(--font-sm)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  width: "100%",
                  marginTop: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Buy Now — ₹{auction.buyNowPrice?.toLocaleString()}
              </button>
            )}

            {user && (
              <button
                onClick={toggleWatchlist}
                style={{
                  background: "transparent",
                  color: watchlistData ? "var(--accent)" : "var(--text)",
                  border: `1.5px solid ${watchlistData ? "var(--accent)" : "var(--border-hard)"}`,
                  padding: "0.55rem",
                  fontWeight: 600,
                  fontSize: "var(--font-sm)",
                  width: "100%",
                  marginTop: "0.75rem",
                  cursor: "pointer",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  transition: "all 0.15s",
                }}
              >
                {watchlistData ? "WATCHING" : "WATCH"}
              </button>
            )}

            {/* ── Seller: Cancel Auction ── */}
            {isSeller && (auction.status === "PENDING" || auction.status === "ACTIVE") && (
              <button
                onClick={cancelAuction}
                disabled={cancelAuctionLoading}
                className="btn-danger"
                style={{
                  width: "100%",
                  marginTop: "0.75rem",
                  borderRadius: 0,
                  opacity: cancelAuctionLoading ? 0.6 : 1,
                  cursor: cancelAuctionLoading ? "not-allowed" : "pointer",
                }}
              >
                {cancelAuctionLoading ? "Cancelling..." : "Cancel Auction"}
              </button>
            )}

            {/* ── Rate counterparty after ended auction ── */}
            {isEnded && auction.winner && (isWinner || isSeller) && !ratingDone && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "1rem",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "var(--font-xs)",
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    marginBottom: "0.5rem",
                  }}
                >
                  Rate {isWinner ? "Seller" : "Buyer"}
                </div>
                <div style={{ display: "flex", gap: "0.25rem", marginBottom: "0.5rem" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRatingValue(star)}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: "1.3rem",
                        cursor: "pointer",
                        color: star <= ratingValue ? "var(--warning)" : "var(--border)",
                        padding: "0.1rem",
                        transition: "color 0.1s",
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="Optional comment..."
                  style={{ marginBottom: "0.5rem" }}
                />
                <button
                  onClick={submitRating}
                  disabled={!ratingValue || ratingLoading}
                  className="btn-primary"
                  style={{
                    width: "100%",
                    borderRadius: 0,
                    opacity: !ratingValue || ratingLoading ? 0.5 : 1,
                  }}
                >
                  {ratingLoading ? "Submitting..." : "Submit Rating"}
                </button>
              </div>
            )}
            {ratingDone && (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "1rem",
                  background: "var(--surface-2)",
                  border: "1.5px solid var(--success)",
                  color: "var(--success)",
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  textAlign: "center",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                [SUBMITTED] Rating recorded
              </div>
            )}
          </div>

          {/* ── Auto-Bid Panel ── */}
          {canBid && (auction.type === "ENGLISH" || auction.type === "DUTCH") && (
            <div
              style={{
                border: "1.5px solid var(--border-hard)",
                padding: "2rem",
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "var(--font-sm)",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  marginBottom: "0.5rem",
                }}
              >
                {auction.type === "DUTCH" ? "Auto-Accept" : "Auto-Bid"}
              </div>
              <p
                style={{
                  fontSize: "var(--font-xs)",
                  color: "var(--muted)",
                  marginBottom: "0.85rem",
                  lineHeight: 1.5,
                }}
              >
                {auction.type === "DUTCH" 
                  ? "Set a target price — system automatically accepts when price drops to this amount."
                  : "Set a maximum — system bids automatically on your behalf."}
              </p>

              {autoBidData ? (
                <div>
                  <div
                    style={{
                      padding: "0.65rem 0.85rem",
                      background: "rgba(196,30,30,0.06)",
                      border: "1px solid var(--accent)",
                      fontSize: "var(--font-sm)",
                      fontWeight: 600,
                      color: "var(--accent)",
                      marginBottom: "0.65rem",
                    }}
                  >
                    Active {auction.type === "DUTCH" ? "at or below" : "up to"} ₹{autoBidData.maxAmount?.toLocaleString()}
                  </div>
                  <button
                    onClick={cancelAutoBid}
                    disabled={cancelLoading}
                    className="btn-danger"
                    style={{ width: "100%", borderRadius: 0, opacity: cancelLoading ? 0.6 : 1, cursor: cancelLoading ? "not-allowed" : "pointer" }}
                  >
                    {cancelLoading ? "Cancelling..." : `Cancel Auto-${auction.type === "DUTCH" ? "Accept" : "Bid"}`}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 0 }}>
                  <input
                    type="number"
                    value={autoBidMax}
                    onChange={(e) => setAutoBidMax(e.target.value)}
                    placeholder={auction.type === "DUTCH" ? "Target price ₹" : "Max amount ₹"}
                    style={{
                      flex: 1,
                      border: "1.5px solid var(--border-hard)",
                      borderRight: "none",
                      borderRadius: 0,
                    }}
                  />
                  <button
                    onClick={setAutoBid}
                    disabled={autoBidLoading}
                    className="btn-primary"
                    style={{ borderRadius: 0, whiteSpace: "nowrap", opacity: autoBidLoading ? 0.6 : 1 }}
                  >
                    {autoBidLoading ? "..." : "Set"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Info panel ── */}
          <div
            style={{
              padding: "2rem",
              flex: 1,
              background: "var(--surface)",
              border: "1.5px solid var(--border-hard)",
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: "var(--font-sm)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text)",
                marginBottom: "1.5rem",
                paddingBottom: "0.75rem",
                borderBottom: "1.5px solid var(--border-hard)",
              }}
            >
              Auction Details
            </div>

            {/* Auction type explanation card */}
            {(() => {
              const typeInfo: Record<string, { icon: string; title: string; desc: string; rules: string[] }> = {
                ENGLISH: {
                  icon: "[ENG]",
                  title: "English Auction",
                  desc: "The classic open ascending-bid format. Bidders compete by placing progressively higher bids. The highest bid when time expires wins.",
                  rules: [
                    `Each bid must be ≥ ₹${auction.minIncrement} above the current price`,
                    "If you get outbid you are notified instantly",
                    `Last ${auction.antiSnipingMins} min bids extend the timer`,
                  ],
                },
                DUTCH: {
                  icon: "[DUT]",
                  title: "Dutch Auction",
                  desc: "The price starts high and drops automatically at regular intervals. The first bidder to accept the current price wins immediately.",
                  rules: [
                    "Price only goes DOWN over time — never up",
                    "Click 'Accept' to win at the displayed price",
                    "First to accept wins — no further bidding",
                  ],
                },
                SEALED_BID: {
                  icon: "[S/B]",
                  title: "Sealed-Bid Auction",
                  desc: "Everyone submits one private bid without seeing others'. After the auction ends all bids are revealed and the highest wins.",
                  rules: [
                    "Bidder names are hidden until auction ends",
                    "You get one shot — choose wisely",
                    "Highest bid wins at the winning price",
                  ],
                },
              };
              const info = typeInfo[auction.type];
              if (!info) return null;
              return (
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    padding: "1rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "1.1rem" }}>{info.icon}</span>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "var(--font-sm)",
                        letterSpacing: "0.03em",
                      }}
                    >
                      {info.title}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: "var(--font-xs)",
                      color: "var(--text-soft)",
                      lineHeight: 1.6,
                      marginBottom: "0.75rem",
                    }}
                  >
                    {info.desc}
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {info.rules.map((rule, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: "var(--font-xs)",
                          color: "var(--muted)",
                          paddingLeft: "0.9rem",
                          position: "relative",
                          marginBottom: "0.3rem",
                          lineHeight: 1.5,
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            color: "var(--accent)",
                            fontWeight: 700,
                          }}
                        >
                          ·
                        </span>
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {auction.type === "DUTCH" ? (
              // Dutch-specific info rows
              [
                {
                  label: "Drop Step",
                  value: auction.dutchPriceStep ? `₹${auction.dutchPriceStep?.toLocaleString()} per drop` : "—",
                },
                {
                  label: "Drop Interval",
                  value: auction.dutchInterval ? `${auction.dutchInterval}s` : "—",
                },
                {
                  label: "Auto-Accept At",
                  value: auction.autoAcceptAmount
                    ? `₹${auction.autoAcceptAmount?.toLocaleString()}`
                    : "Not set (runs until accepted)",
                },
                {
                  label: "Ends",
                  value: new Date(effectiveEndTime).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.65rem",
                    fontSize: "var(--font-sm)",
                  }}
                >
                  <span style={{ color: "var(--muted)", fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontWeight: 600 }}>{item.value}</span>
                </div>
              ))
            ) : (
              [
                {
                  label: "Anti-Sniping",
                  value: auction.antiSnipingMins > 0
                    ? `${auction.antiSnipingMins}m extension on late bids`
                    : "Disabled",
                },
                {
                  label: "Ends",
                  value: new Date(effectiveEndTime).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.65rem",
                    fontSize: "var(--font-sm)",
                  }}
                >
                  <span style={{ color: "var(--muted)", fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontWeight: 600 }}>{item.value}</span>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
