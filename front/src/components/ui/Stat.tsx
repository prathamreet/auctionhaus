import * as React from "react";

export function Stat({
  label,
  value,
  color,
  size = "lg",
  style,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  color?: string;
  size?: "md" | "lg" | "xl";
  style?: React.CSSProperties;
}) {
  const valueSize =
    size === "xl" ? "2.75rem" : size === "lg" ? "2rem" : "1.5rem";
  return (
    <div
      style={{
        padding: "1.5rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        ...style,
      }}
    >
      <div
        style={{
          fontSize: "var(--font-xs)",
          fontWeight: 700,
          color: "var(--muted)",
          marginBottom: "0.5rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: valueSize,
          fontWeight: 600,
          color: color ?? "var(--text)",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function StatGrid({
  children,
  minWidth = 220,
}: {
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: "1rem",
      }}
    >
      {children}
    </div>
  );
}
