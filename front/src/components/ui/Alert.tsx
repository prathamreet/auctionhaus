import * as React from "react";

type Tone = "error" | "success" | "info" | "warning";

const TONE: Record<Tone, { bg: string; color: string; border: string }> = {
  error: {
    bg: "color-mix(in srgb, var(--danger) 10%, transparent)",
    color: "var(--danger)",
    border: "var(--danger)",
  },
  success: {
    bg: "color-mix(in srgb, var(--success) 10%, transparent)",
    color: "var(--success)",
    border: "var(--success)",
  },
  info: {
    bg: "color-mix(in srgb, var(--accent) 10%, transparent)",
    color: "var(--accent)",
    border: "var(--accent)",
  },
  warning: {
    bg: "color-mix(in srgb, var(--warning) 12%, transparent)",
    color: "var(--warning)",
    border: "var(--warning)",
  },
};

export function Alert({
  tone = "info",
  children,
  style,
}: {
  tone?: Tone;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const t = TONE[tone];
  return (
    <div
      style={{
        padding: "0.7rem 0.9rem",
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.color,
        fontSize: "var(--font-sm)",
        fontWeight: 600,
        borderRadius: "var(--radius)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
