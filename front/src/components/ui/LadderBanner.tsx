"use client";
import * as React from "react";
import { formatMoney } from "./Money";

/**
 * Phase F3 — ephemeral "auto-bid ladder resolved" banner.
 *
 * Rendered above the bid history for ~3 s when a `bid:ladder` socket event
 * arrives carrying 2 or more rungs. Communicates to the viewer that the
 * price change they're seeing was NOT a single bidder jumping — it was a
 * sequence of automated counter-bids, and the bid history will scroll
 * accordingly.
 *
 * Without this, a user watching the chart sees the price jump from ₹1,000
 * to ₹1,800 and wonders why eight rungs appeared at once. The banner names
 * the mechanism.
 *
 * The component auto-unmounts via parent state — the parent sets a key per
 * ladder event and clears it after the animation. Internally the CSS class
 * `ah-banner-drop` handles the entrance and `ah-banner-fade` (3 s delayed)
 * handles the exit. No JS timer needed.
 */
export function LadderBanner({
  rungs,
  fromPrice,
  toPrice,
}: {
  rungs: number;
  fromPrice: number;
  toPrice: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="ah-banner-drop ah-banner-fade"
      style={{
        margin: "0.5rem 0",
        padding: "0.55rem 0.85rem",
        background:
          "color-mix(in srgb, var(--accent-dark) 12%, var(--surface))",
        border: "1px solid var(--accent-dark)",
        borderRadius: "var(--radius)",
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden
        style={{
          color: "var(--accent-dark)",
          fontWeight: 800,
          fontSize: "var(--font-md)",
          lineHeight: 1,
        }}
      >
        ⇈
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: "var(--font-xs)",
            fontWeight: 800,
            color: "var(--accent-dark)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginRight: "0.5rem",
          }}
        >
          Auto-bid ladder
        </span>
        <span
          style={{
            fontSize: "var(--font-sm)",
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          {rungs} {rungs === 1 ? "rung" : "rungs"} resolved ·{" "}
          <span className="tabular">
            {formatMoney(fromPrice)} → {formatMoney(toPrice)}
          </span>
        </span>
      </div>
    </div>
  );
}
