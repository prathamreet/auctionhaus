"use client";
import * as React from "react";

/**
 * Phase F7 — visual surface for the `bid:backpressure` socket event.
 *
 * Sticky just-below-the-navbar yellow banner. Shown when the BidSequencer
 * stream length exceeds the backpressure threshold (Phase E6). Tells users
 * (or admins) that bids placed right now may be rejected or delayed.
 *
 * Two intended consumers:
 *   - admin: subscribed to the `admin:fraud` room which receives every
 *     backpressure event, regardless of which auction is saturated.
 *   - bidder on a hot auction: same event broadcast to their auction room
 *     would be a useful future enhancement; for now the bidder sees the
 *     503 response inline near the bid input.
 *
 * Auto-dismisses after `autoDismissMs` (default 8 s). If a new backpressure
 * event arrives during the dismiss window, the parent resets the key and
 * the banner re-renders fresh.
 */
export function BackpressureBanner({
  auctionId,
  streamLength,
  threshold,
  onDismiss,
  autoDismissMs = 8000,
}: {
  auctionId: string;
  streamLength: number;
  threshold: number;
  onDismiss: () => void;
  autoDismissMs?: number;
}) {
  React.useEffect(() => {
    const t = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(t);
  }, [onDismiss, autoDismissMs]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="ah-banner-drop ah-banner-shake"
      style={{
        position: "sticky",
        top: "var(--navbar-h)",
        zIndex: 80,
        background:
          "color-mix(in srgb, var(--warning) 14%, var(--surface))",
        borderBottom: "1px solid var(--warning)",
        color: "var(--text)",
        padding: "0.55rem clamp(1rem, 4vw, 4rem)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span
          aria-hidden
          style={{
            color: "var(--warning)",
            fontWeight: 800,
            fontSize: "var(--font-md)",
            lineHeight: 1,
          }}
        >
          ≋
        </span>
        <div>
          <span
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 800,
              color: "var(--warning)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginRight: "0.5rem",
            }}
          >
            High traffic
          </span>
          <span style={{ fontSize: "var(--font-sm)", fontWeight: 600 }}>
            Auction <code style={{ fontFamily: "var(--font-mono, monospace)" }}>{auctionId.slice(0, 8)}…</code>
            {" "}has {streamLength} pending bids (threshold {threshold}). New bids may be delayed.
          </span>
        </div>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss high-traffic notice"
        style={{
          background: "transparent",
          border: "1px solid var(--warning)",
          color: "var(--warning)",
          fontSize: "var(--font-xs)",
          fontWeight: 700,
          padding: "0.3rem 0.65rem",
          borderRadius: "var(--radius)",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
