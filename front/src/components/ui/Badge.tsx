import * as React from "react";

type Tone =
  | "neutral"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "dutch"
  | "sealed"
  | "english";

const TONE: Record<Tone, { bg: string; color: string; border: string }> = {
  neutral: {
    bg: "var(--surface-2)",
    color: "var(--text-soft)",
    border: "var(--border)",
  },
  accent: {
    bg: "color-mix(in srgb, var(--accent) 12%, transparent)",
    color: "var(--accent)",
    border: "color-mix(in srgb, var(--accent) 40%, transparent)",
  },
  success: {
    bg: "color-mix(in srgb, var(--success) 14%, transparent)",
    color: "var(--success)",
    border: "color-mix(in srgb, var(--success) 40%, transparent)",
  },
  danger: {
    bg: "color-mix(in srgb, var(--danger) 14%, transparent)",
    color: "var(--danger)",
    border: "color-mix(in srgb, var(--danger) 40%, transparent)",
  },
  warning: {
    bg: "color-mix(in srgb, var(--warning) 18%, transparent)",
    color: "var(--warning)",
    border: "color-mix(in srgb, var(--warning) 45%, transparent)",
  },
  dutch: {
    bg: "color-mix(in srgb, var(--dutch) 14%, transparent)",
    color: "var(--dutch)",
    border: "color-mix(in srgb, var(--dutch) 40%, transparent)",
  },
  sealed: {
    bg: "color-mix(in srgb, var(--sealed) 14%, transparent)",
    color: "var(--sealed)",
    border: "color-mix(in srgb, var(--sealed) 40%, transparent)",
  },
  english: {
    bg: "color-mix(in srgb, var(--accent) 12%, transparent)",
    color: "var(--accent)",
    border: "color-mix(in srgb, var(--accent) 40%, transparent)",
  },
};

export function Badge({
  tone = "neutral",
  children,
  style,
}: {
  tone?: Tone;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const t = TONE[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.15rem 0.5rem",
        fontSize: "var(--font-xs)",
        fontWeight: 700,
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        borderRadius: 4,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

const AUCTION_TONE: Record<string, Tone> = {
  ENGLISH: "english",
  DUTCH: "dutch",
  SEALED_BID: "sealed",
};
const AUCTION_LABEL: Record<string, string> = {
  ENGLISH: "English",
  DUTCH: "Dutch",
  SEALED_BID: "Sealed Bid",
};

export function AuctionTypeBadge({ type }: { type: string }) {
  return (
    <Badge tone={AUCTION_TONE[type] ?? "neutral"}>
      {AUCTION_LABEL[type] ?? type}
    </Badge>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  PENDING: "warning",
  ENDED: "neutral",
  CANCELLED: "danger",
};

export function AuctionStatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status}</Badge>;
}
