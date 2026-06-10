"use client";
import * as React from "react";
import { Money, formatMoney } from "./Money";
import { Badge } from "./Badge";

/**
 * Phase F6 — health card for the viewer's own active auto-bid.
 *
 * Replaces the old text-only "Auto-bid up to ₹X" line on the PricePanel
 * with a richer state-aware card showing the four pieces of information
 * users actually want to know while watching a live auction:
 *
 *   1. The cap (`maxAmount`) — what they committed to.
 *   2. The current bid — what the system has actually held so far.
 *   3. The headroom — `maxAmount - currentBid`, i.e. how far the proxy
 *      can still go before exhausting.
 *   4. The state — winning / contested / exhausted.
 *
 * The card derives state from the existing AutoBid query data plus the
 * current auction price. No new endpoint is required.
 *
 * Visual states:
 *   - winning   — green frame, "Leading at ₹X"
 *   - contested — amber frame, "Competing — at ₹X of ₹Y cap"
 *   - exhausted — red frame, "Cap reached — bidder is leading"
 *     (where bidder = some other user whose limit was higher)
 *
 * `onCancel` is wired to the existing cancel mutation.
 */
export function AutoBidHealth({
  maxAmount,
  currentBid,
  currentPrice,
  isViewerWinning,
  loading,
  onCancel,
}: {
  /** maxAmount the viewer registered. */
  maxAmount: number;
  /** The most recent bid the auto-bid placed on the viewer's behalf
   *  (0 if the auto-bid has never fired yet). */
  currentBid: number;
  /** Auction's currentPrice (after any concurrent ladder). */
  currentPrice: number;
  /** True if the viewer is currently the winning bidder. */
  isViewerWinning: boolean;
  loading: boolean;
  onCancel: () => void;
}) {
  // Derived state.
  // - Cap reached: currentPrice equals or exceeds maxAmount AND viewer is NOT
  //   winning. The proxy ran up to its limit and was outbid by a higher limit.
  // - Winning: viewer is the current winning bidder. Could be because the
  //   ladder placed them there, or because they manually bid.
  // - Armed (the implicit third state): someone else is winning at
  //   < maxAmount; the auto-bid is still armed and will fire on the next
  //   manual bid against them. It is the fall-through "warning" tone below.
  const capReached = currentPrice >= maxAmount && !isViewerWinning;
  const winning = isViewerWinning;

  const tone = winning
    ? "success"
    : capReached
      ? "danger"
      : "warning";
  const accent =
    tone === "success"
      ? "var(--success)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--warning)";

  const headroom = Math.max(0, maxAmount - Math.max(currentBid, currentPrice));
  const usedPct =
    maxAmount > 0
      ? Math.min(100, Math.round((currentBid / maxAmount) * 100))
      : 0;

  const headline = winning
    ? "Leading the auction"
    : capReached
      ? "Cap reached — outbid by a higher limit"
      : "Armed and watching";

  const sub = winning
    ? `You are the current winning bidder${
        currentBid > 0 ? ` at ${formatMoney(currentBid)}` : ""
      }.`
    : capReached
      ? `Auction price is now ${formatMoney(currentPrice)}. Your ${formatMoney(
          maxAmount,
        )} cap has been exceeded.`
      : `Will auto-bid up to ${formatMoney(maxAmount)} the moment you are outbid. Headroom: ${formatMoney(headroom)}.`;

  return (
    <div
      role="group"
      aria-label="Your auto-bid status"
      style={{
        border: `1px solid ${accent}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: "var(--radius)",
        padding: "0.85rem 1rem",
        background: `color-mix(in srgb, ${accent} 6%, var(--surface))`,
        display: "flex",
        flexDirection: "column",
        gap: "0.65rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            aria-hidden
            style={{
              color: accent,
              fontWeight: 800,
              fontSize: "var(--font-md)",
              lineHeight: 1,
            }}
          >
            ⇈
          </span>
          <span
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 800,
              color: accent,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Auto-bid
          </span>
          <Badge tone={tone}>{winning ? "WINNING" : capReached ? "EXHAUSTED" : "ARMED"}</Badge>
        </div>
        <button
          onClick={onCancel}
          disabled={loading}
          aria-label="Cancel auto-bid"
          style={{
            background: "transparent",
            border: "1px solid var(--border-hard)",
            color: "var(--muted)",
            fontSize: "var(--font-xs)",
            fontWeight: 700,
            padding: "0.3rem 0.6rem",
            borderRadius: "var(--radius)",
            opacity: loading ? 0.55 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "…" : "Cancel"}
        </button>
      </div>

      <div>
        <div
          style={{
            fontSize: "var(--font-sm)",
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: 2,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--text-soft)",
            lineHeight: 1.45,
          }}
        >
          {sub}
        </div>
      </div>

      {/* Capacity bar — shows currentBid vs maxAmount. */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          <span>
            Used <Money value={currentBid} size="sm" color="inherit" />
          </span>
          <span>
            Cap <Money value={maxAmount} size="sm" color="inherit" />
          </span>
        </div>
        <div
          style={{
            position: "relative",
            height: 6,
            background: "var(--surface-2)",
            borderRadius: 3,
            overflow: "hidden",
          }}
          role="progressbar"
          aria-valuenow={usedPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${usedPct}%`,
              background: accent,
              transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
