"use client";
import * as React from "react";
import Link from "next/link";
import {
  Alert,
  AutoBidHealth,
  Badge,
  Button,
  Card,
  Countdown,
  Field,
  Input,
  Money,
  formatMoney,
} from "@/components/ui";
import { WinnerCertificate } from "./WinnerCertificate";

interface AuctionForPrice {
  id: string;
  title: string;
  type: "ENGLISH" | "DUTCH" | "SEALED_BID";
  status: string;
  currentPrice: number;
  startingPrice: number;
  buyNowPrice?: number;
  minIncrement: number;
  endTime: string;
  winnerId?: string;
  winner?: { id: string; name: string };
  seller?: { id: string; name: string };
}

interface AutoBidState {
  maxAmount: number;
  // Phase F6: server's getMyAutoBid returns the full row including
  // `currentBid` (the last bid the auto-bid placed on your behalf, 0 if
  // never fired). The AutoBidHealth card uses it for the capacity bar.
  currentBid?: number;
}

export function PricePanel({
  auction,
  effectiveEndTime,
  viewerId,
  isSeller,
  isWinner,
  isViewerWinning,
  hasOwnSealedBid,
  bidAmount,
  setBidAmount,
  autoBidMax,
  setAutoBidMax,
  bidErr,
  bidSuccess,
  bidLoading,
  autoBidLoading,
  cancelLoading,
  cancelAuctionLoading,
  watchlistData,
  autoBidData,
  onPlaceBid,
  onSetAutoBid,
  onCancelAutoBid,
  onToggleWatchlist,
  onBuyNow,
  onCancelAuction,
  rating,
}: {
  auction: AuctionForPrice;
  effectiveEndTime: string;
  viewerId: string | undefined;
  isSeller: boolean;
  /** True after the auction ENDED and the viewer is the final winner. */
  isWinner: boolean;
  /** Phase F6: true while the auction is LIVE and the viewer is the top
   *  bidder (used to colour the auto-bid health card green vs amber). */
  isViewerWinning: boolean;
  hasOwnSealedBid: boolean;
  bidAmount: string;
  setBidAmount: (v: string) => void;
  autoBidMax: string;
  setAutoBidMax: (v: string) => void;
  bidErr: string;
  bidSuccess: string;
  bidLoading: boolean;
  autoBidLoading: boolean;
  cancelLoading: boolean;
  cancelAuctionLoading: boolean;
  watchlistData: boolean | undefined;
  autoBidData: AutoBidState | null | undefined;
  onPlaceBid: () => void;
  onSetAutoBid: () => void;
  onCancelAutoBid: () => void;
  onToggleWatchlist: () => void;
  onBuyNow: () => void;
  onCancelAuction: () => void;
  rating: {
    value: number;
    setValue: (n: number) => void;
    comment: string;
    setComment: (s: string) => void;
    loading: boolean;
    done: boolean;
    submit: () => void;
  };
}) {
  const isEnded = auction.status === "ENDED";
  const canBid = !!viewerId && !isSeller && auction.status === "ACTIVE";
  const minNext =
    Number(auction.currentPrice) + Number(auction.minIncrement);

  return (
    <Card padding="lg">
      <div
        style={{
          fontSize: "var(--font-xs)",
          fontWeight: 700,
          color: "var(--muted)",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {isEnded ? "Final price" : "Current bid"}
      </div>
      <Money
        value={auction.currentPrice}
        size="xl"
        style={{ display: "block", marginBottom: "1rem" }}
      />

      {!isEnded && (
        <div
          style={{
            padding: "0.85rem 1rem",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            marginBottom: "1.25rem",
          }}
        >
          <div
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              color: "var(--muted)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Time remaining
          </div>
          <Countdown endTime={effectiveEndTime} size="md" />
        </div>
      )}

      {isEnded && (
        <div
          style={{
            padding: "1rem",
            background: auction.winner
              ? "color-mix(in srgb, var(--success) 8%, transparent)"
              : "var(--surface-2)",
            border: `1px solid ${auction.winner ? "var(--success)" : "var(--border)"}`,
            borderRadius: "var(--radius)",
            marginBottom: "1rem",
          }}
        >
          {auction.winner ? (
            <div>
              <div
                style={{
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  color: "var(--success)",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {isWinner ? "You won" : isSeller ? "Sold" : "Winner"}
              </div>
              <div style={{ fontWeight: 700, fontSize: "var(--font-sm)" }}>
                {isWinner
                  ? `Congratulations — you won for ${formatMoney(auction.currentPrice)}`
                  : `${auction.winner.name} won for ${formatMoney(auction.currentPrice)}`}
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  color: "var(--muted)",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Auction ended
              </div>
              <div style={{ fontWeight: 700, fontSize: "var(--font-sm)", color: "var(--muted)" }}>
                UNSOLD — reserve not met or no bids
              </div>
            </div>
          )}
        </div>
      )}

      {isEnded && (isWinner || isSeller) && (
        <WinnerCertificate
          auction={{
            id: auction.id,
            title: auction.title,
            currentPrice: auction.currentPrice,
            endTime: auction.endTime,
            winner: auction.winner,
            seller: auction.seller,
          }}
          isWinner={isWinner}
          isSeller={isSeller}
        />
      )}

      {canBid && auction.type !== "DUTCH" && (
        <BidForm
          type={auction.type}
          startingPrice={auction.startingPrice}
          minNext={minNext}
          hasOwnSealedBid={hasOwnSealedBid}
          bidAmount={bidAmount}
          setBidAmount={setBidAmount}
          bidErr={bidErr}
          bidSuccess={bidSuccess}
          bidLoading={bidLoading}
          onPlaceBid={onPlaceBid}
        />
      )}

      {canBid && auction.type === "DUTCH" && (
        <DutchAccept
          currentPrice={auction.currentPrice}
          bidErr={bidErr}
          bidLoading={bidLoading}
          onAccept={() => {
            setBidAmount(String(auction.currentPrice));
            onPlaceBid();
          }}
        />
      )}

      {auction.buyNowPrice != null && canBid && (
        <Button
          variant="success"
          fullWidth
          onClick={onBuyNow}
          style={{ marginTop: "0.75rem" }}
        >
          Buy now — {formatMoney(auction.buyNowPrice)}
        </Button>
      )}

      {viewerId && (
        <Button
          variant={watchlistData ? "primary" : "ghost"}
          fullWidth
          onClick={onToggleWatchlist}
          style={{ marginTop: "0.75rem" }}
        >
          {watchlistData ? "Watching" : "Add to watchlist"}
        </Button>
      )}

      {isSeller &&
        (auction.status === "PENDING" || auction.status === "ACTIVE") && (
          <Button
            variant="danger"
            fullWidth
            onClick={onCancelAuction}
            loading={cancelAuctionLoading}
            style={{ marginTop: "0.75rem" }}
          >
            Cancel auction
          </Button>
        )}

      {isEnded && auction.winner && (isWinner || isSeller) && (
        <RatingPanel
          target={isWinner ? "Seller" : "Buyer"}
          value={rating.value}
          setValue={rating.setValue}
          comment={rating.comment}
          setComment={rating.setComment}
          loading={rating.loading}
          done={rating.done}
          onSubmit={rating.submit}
        />
      )}

      {viewerId && canBid && (auction.type === "ENGLISH" || auction.type === "DUTCH") && (
        <AutoBidPanel
          type={auction.type}
          autoBidData={autoBidData}
          autoBidMax={autoBidMax}
          setAutoBidMax={setAutoBidMax}
          loading={autoBidLoading}
          cancelLoading={cancelLoading}
          onSet={onSetAutoBid}
          onCancel={onCancelAutoBid}
          // Phase F6: data feed for the AutoBidHealth card.
          currentPrice={auction.currentPrice}
          isViewerWinning={isViewerWinning}
        />
      )}
    </Card>
  );
}

function BidForm({
  type,
  startingPrice,
  minNext,
  hasOwnSealedBid,
  bidAmount,
  setBidAmount,
  bidErr,
  bidSuccess,
  bidLoading,
  onPlaceBid,
}: {
  type: "ENGLISH" | "DUTCH" | "SEALED_BID";
  startingPrice: number;
  minNext: number;
  hasOwnSealedBid: boolean;
  bidAmount: string;
  setBidAmount: (v: string) => void;
  bidErr: string;
  bidSuccess: string;
  bidLoading: boolean;
  onPlaceBid: () => void;
}) {
  return (
    <div>
      {type === "SEALED_BID" && (
        <Alert tone="info" style={{ marginBottom: "0.75rem" }}>
          Sealed bid — private until close. One bid per user; submitting again
          updates your bid.
        </Alert>
      )}
      {bidErr && (
        <Alert tone="error" style={{ marginBottom: "0.75rem" }}>
          {bidErr}
        </Alert>
      )}
      {bidSuccess && (
        <Alert tone="success" style={{ marginBottom: "0.75rem" }}>
          {bidSuccess}
        </Alert>
      )}

      <Field
        label={
          type === "SEALED_BID"
            ? `Your sealed bid (above ${formatMoney(startingPrice)})`
            : `Next bid (min ${formatMoney(minNext)})`
        }
      >
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Input
            type="number"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder={
              type === "SEALED_BID"
                ? `Above ${formatMoney(startingPrice)}`
                : `Min ${formatMoney(minNext)}`
            }
            onKeyDown={(e) => e.key === "Enter" && onPlaceBid()}
          />
          <Button onClick={onPlaceBid} loading={bidLoading}>
            {type === "SEALED_BID"
              ? hasOwnSealedBid
                ? "Update bid"
                : "Submit bid"
              : "Place bid"}
          </Button>
        </div>
      </Field>
      {/* Phase F5: live feedback as the user types. Three states:
            - empty → silent
            - below minimum → red explaining the gap
            - valid → green showing the overshoot
          The check uses the same Number() conversion the server does on
          parse; if the user pastes "abc" the cast is NaN and we show
          nothing (the input validation handles the error path on submit). */}
      <BidInputFeedback
        type={type}
        bidAmount={bidAmount}
        startingPrice={startingPrice}
        minNext={minNext}
      />
    </div>
  );
}

function BidInputFeedback({
  type,
  bidAmount,
  startingPrice,
  minNext,
}: {
  type: "ENGLISH" | "DUTCH" | "SEALED_BID";
  bidAmount: string;
  startingPrice: number;
  minNext: number;
}) {
  if (!bidAmount.trim()) return null;
  const parsed = Number(bidAmount);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  const threshold = type === "SEALED_BID" ? startingPrice : minNext;
  const isValid =
    type === "SEALED_BID" ? parsed > startingPrice : parsed >= minNext;
  const delta = parsed - threshold;

  const tone = isValid ? "var(--success)" : "var(--danger)";
  const label = isValid
    ? type === "SEALED_BID"
      ? `${formatMoney(delta)} above starting price`
      : `${formatMoney(delta)} above minimum`
    : type === "SEALED_BID"
      ? `Must be above ${formatMoney(startingPrice)}`
      : `${formatMoney(threshold - parsed)} below minimum`;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: "0.45rem",
        display: "flex",
        alignItems: "center",
        gap: "0.45rem",
        fontSize: "var(--font-xs)",
        fontWeight: 700,
        color: tone,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tone,
        }}
      />
      {label}
    </div>
  );
}

function DutchAccept({
  currentPrice,
  bidErr,
  bidLoading,
  onAccept,
}: {
  currentPrice: number;
  bidErr: string;
  bidLoading: boolean;
  onAccept: () => void;
}) {
  return (
    <div>
      {bidErr && (
        <Alert tone="error" style={{ marginBottom: "0.75rem" }}>
          {bidErr}
        </Alert>
      )}
      <Alert tone="info" style={{ marginBottom: "0.75rem" }}>
        Dutch auction — price drops over time. Accept the current price to
        win.
      </Alert>
      <Button
        variant="dutch"
        fullWidth
        size="lg"
        loading={bidLoading}
        onClick={onAccept}
      >
        Accept {formatMoney(currentPrice)} →
      </Button>
    </div>
  );
}

function AutoBidPanel({
  type,
  autoBidData,
  autoBidMax,
  setAutoBidMax,
  loading,
  cancelLoading,
  onSet,
  onCancel,
  currentPrice,
  isViewerWinning,
}: {
  type: "ENGLISH" | "DUTCH";
  autoBidData: AutoBidState | null | undefined;
  autoBidMax: string;
  setAutoBidMax: (v: string) => void;
  loading: boolean;
  cancelLoading: boolean;
  onSet: () => void;
  onCancel: () => void;
  /** Phase F6: current auction price, for the health card. */
  currentPrice: number;
  /** Phase F6: is the viewer the current top bidder? */
  isViewerWinning: boolean;
}) {
  const label = type === "DUTCH" ? "Auto-accept" : "Auto-bid";
  const description =
    type === "DUTCH"
      ? "Set a target — the system accepts when the price drops here."
      : "Set a maximum — the system bids on your behalf, one increment at a time.";

  // Phase F6: for English auctions with an active auto-bid, render the
  // dedicated health card instead of the plain "Active up to ₹X" alert.
  // Dutch keeps the simple display because the semantics differ (a target
  // price, not a ceiling — no capacity bar to draw).
  if (autoBidData && type === "ENGLISH") {
    return (
      <div style={{ marginTop: "1rem" }}>
        <AutoBidHealth
          maxAmount={autoBidData.maxAmount}
          currentBid={autoBidData.currentBid ?? 0}
          currentPrice={currentPrice}
          isViewerWinning={isViewerWinning}
          loading={cancelLoading}
          onCancel={onCancel}
        />
      </div>
    );
  }

  return (
    <Card padding="md" style={{ marginTop: "1rem" }}>
      <div style={{ fontWeight: 700, fontSize: "var(--font-sm)", marginBottom: 4 }}>
        {label}
      </div>
      <p
        style={{
          fontSize: "var(--font-xs)",
          color: "var(--muted)",
          marginBottom: "0.85rem",
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>

      {autoBidData ? (
        <div>
          <Alert tone="info" style={{ marginBottom: "0.65rem" }}>
            Active {type === "DUTCH" ? "at or below" : "up to"}{" "}
            <strong>{formatMoney(autoBidData.maxAmount)}</strong>
          </Alert>
          <Button
            variant="danger"
            fullWidth
            loading={cancelLoading}
            onClick={onCancel}
          >
            Cancel {type === "DUTCH" ? "auto-accept" : "auto-bid"}
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Input
            type="number"
            value={autoBidMax}
            onChange={(e) => setAutoBidMax(e.target.value)}
            placeholder={type === "DUTCH" ? "Target ₹" : "Max ₹"}
          />
          <Button loading={loading} onClick={onSet}>
            Set
          </Button>
        </div>
      )}
    </Card>
  );
}

function RatingPanel({
  target,
  value,
  setValue,
  comment,
  setComment,
  loading,
  done,
  onSubmit,
}: {
  target: string;
  value: number;
  setValue: (n: number) => void;
  comment: string;
  setComment: (s: string) => void;
  loading: boolean;
  done: boolean;
  onSubmit: () => void;
}) {
  if (done) {
    return (
      <Alert tone="success" style={{ marginTop: "0.75rem" }}>
        Rating recorded
      </Alert>
    );
  }
  return (
    <Card padding="md" style={{ marginTop: "1rem" }}>
      <div
        style={{ fontWeight: 700, fontSize: "var(--font-xs)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}
      >
        Rate {target}
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: "0.5rem" }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setValue(star)}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.3rem",
              cursor: "pointer",
              color: star <= value ? "var(--warning)" : "var(--border-hard)",
              padding: 2,
            }}
          >
            ★
          </button>
        ))}
      </div>
      <Input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment…"
        style={{ marginBottom: "0.5rem" }}
      />
      <Button
        fullWidth
        loading={loading}
        disabled={!value}
        onClick={onSubmit}
      >
        Submit rating
      </Button>
    </Card>
  );
}

export function AuctionMeta({
  type,
  status,
  isEnded,
  sellerId,
  sellerName,
  bidCount,
  viewers,
}: {
  type: "ENGLISH" | "DUTCH" | "SEALED_BID";
  status: string;
  isEnded: boolean;
  sellerId: string;
  sellerName: string;
  bidCount: number;
  /**
   * Phase E8: live viewer count from `auction:presence`. Undefined / null
   * means "we have not yet received the first emit"; render nothing rather
   * than flash "0 watching".
   */
  viewers?: number | null;
}) {
  return (
    <div
      style={{
        padding: "2.5rem 0 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <Badge tone={type === "ENGLISH" ? "english" : type === "DUTCH" ? "dutch" : "sealed"}>
          {type === "SEALED_BID" ? "Sealed Bid" : type.charAt(0) + type.slice(1).toLowerCase()}
        </Badge>
        <Badge tone={isEnded ? "neutral" : "success"}>{status}</Badge>
        {!isEnded && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: "var(--font-xs)",
              color: "var(--success)",
              fontWeight: 700,
            }}
          >
            <span className="live-dot" />
            Live
          </span>
        )}
        {!isEnded && typeof viewers === "number" && viewers > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
              fontWeight: 600,
            }}
            title={`${viewers} ${viewers === 1 ? "viewer is" : "viewers are"} watching this auction`}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--muted)",
              }}
            />
            {viewers} watching
          </span>
        )}
      </div>
      <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)" }}>
        Seller:{" "}
        <Link href={`/users/${sellerId}`} style={{ color: "var(--text)", fontWeight: 700 }}>
          {sellerName}
        </Link>{" "}
        · {bidCount} total bids
      </div>
    </div>
  );
}
