"use client";
import * as React from "react";
import { useConnectionState } from "@/lib/useSocketListener";

/**
 * Phase F2 — Navbar connection indicator.
 *
 * Reads `useConnectionState` and renders a tri-state pill:
 *   connected     → green dot, no label (hidden by default — assume OK)
 *   reconnecting  → amber pulsing dot + "Reconnecting"
 *   offline       → red dot + "Offline"
 *
 * Production rationale: users need to know when they are NOT seeing
 * real-time bid updates. The current bidirectional flow (Socket.io + TanStack
 * Query invalidate-on-event) silently degrades if the socket drops --
 * pages still render the LAST fetched state with no indication that newer
 * bids have happened. This component closes that loop.
 *
 * `mode="compact"` shows only the dot (used in tight chrome like Navbar
 * mobile); `mode="full"` shows dot + label.
 */
export function ConnectionStatus({
  mode = "full",
}: {
  mode?: "compact" | "full";
}) {
  const state = useConnectionState();

  // When healthy, render nothing to avoid visual noise. The user has no need
  // to see "connected" — they need to know when they are NOT.
  if (state === "connected") return null;

  const isReconnecting = state === "reconnecting";
  const color = isReconnecting ? "var(--warning)" : "var(--danger)";
  const label = isReconnecting ? "Reconnecting" : "Offline";

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Socket connection ${label.toLowerCase()}`}
      title={
        isReconnecting
          ? "Attempting to reconnect. Live bid updates are paused."
          : "Offline. Live bid updates are not received."
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
        padding: mode === "compact" ? 0 : "0.3rem 0.65rem",
        border: mode === "compact" ? "none" : `1px solid ${color}`,
        borderRadius: "var(--radius)",
        background:
          mode === "compact"
            ? "transparent"
            : `color-mix(in srgb, ${color} 10%, transparent)`,
        fontSize: "var(--font-xs)",
        fontWeight: 700,
        color,
      }}
    >
      <span
        className={isReconnecting ? "ah-conn-pulse" : undefined}
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {mode === "full" && label}
    </span>
  );
}
