"use client";
import * as React from "react";

export function formatRemaining(diffMs: number): string {
  if (diffMs <= 0) return "Ended";
  const d = Math.floor(diffMs / 86400000);
  const h = Math.floor((diffMs % 86400000) / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

/**
 * Phase F5 — tri-state urgency. Defaults preserve the previous API:
 *   - default `urgentMs = 3,600,000`   → warning state from 1 h out
 *   - default `criticalMs = 30,000`    → critical state in last 30 s
 *
 * Critical adds an attention-grabbing pulse animation (`ah-pulse-urgent`)
 * driven by globals.css. Warning is colour-only (amber). Outside both
 * thresholds the countdown is plain text.
 *
 * The 1 s tick is unchanged; under 60 s remaining we tick at 250 ms so the
 * "29s, 28s, ..." reading feels accurate at the moment the user is most
 * likely to be racing the clock.
 */
export function Countdown({
  endTime,
  size = "lg",
  urgentMs = 3600000,
  criticalMs = 30000,
  style,
}: {
  endTime: string;
  size?: "sm" | "md" | "lg";
  urgentMs?: number;
  criticalMs?: number;
  style?: React.CSSProperties;
}) {
  // `now` is held in state and advanced by the interval so the render stays
  // pure (no Date.now() call in the render body). The lazy initializer is the
  // sanctioned escape hatch for reading the clock once at mount.
  const [now, setNow] = React.useState(() => Date.now());

  // Adaptive tick rate. Faster ticks when the auction is in its final
  // minute so the displayed seconds are never stale by more than 250 ms.
  React.useEffect(() => {
    const remaining = new Date(endTime).getTime() - Date.now();
    const fast = remaining > 0 && remaining < 60_000;
    const id = setInterval(() => setNow(Date.now()), fast ? 250 : 1000);
    return () => clearInterval(id);
  }, [endTime]);

  const diff = new Date(endTime).getTime() - now;
  const text = formatRemaining(diff);
  const ended = diff <= 0;
  const critical = !ended && diff < criticalMs;
  const urgent = !ended && !critical && diff < urgentMs;

  const fontSize =
    size === "lg" ? "2rem" : size === "md" ? "1.4rem" : "var(--font-base)";

  const color = ended
    ? "var(--muted)"
    : critical
      ? "var(--danger)"
      : urgent
        ? "var(--warning)"
        : "var(--text)";

  return (
    <span
      className={critical ? "ah-pulse-urgent" : undefined}
      style={{
        display: "inline-block",
        fontVariantNumeric: "tabular-nums",
        fontWeight: critical ? 800 : 700,
        fontSize,
        color,
        ...style,
      }}
    >
      {text}
    </span>
  );
}
