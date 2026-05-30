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

export function Countdown({
  endTime,
  size = "lg",
  urgentMs = 3600000,
  style,
}: {
  endTime: string;
  size?: "sm" | "md" | "lg";
  urgentMs?: number;
  style?: React.CSSProperties;
}) {
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    const id = setInterval(force, 1000);
    return () => clearInterval(id);
  }, []);

  const diff = new Date(endTime).getTime() - Date.now();
  const text = formatRemaining(diff);
  const urgent = diff > 0 && diff < urgentMs;
  const ended = diff <= 0;

  const fontSize =
    size === "lg" ? "2rem" : size === "md" ? "1.4rem" : "var(--font-base)";

  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: 700,
        fontSize,
        color: ended
          ? "var(--muted)"
          : urgent
          ? "var(--danger)"
          : "var(--text)",
        ...style,
      }}
    >
      {text}
    </span>
  );
}
