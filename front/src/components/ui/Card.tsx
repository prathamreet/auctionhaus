import * as React from "react";

type Padding = "none" | "sm" | "md" | "lg";

const PAD: Record<Padding, string> = {
  none: "0",
  sm: "1rem",
  md: "1.5rem",
  lg: "2rem",
};

export function Card({
  children,
  padding = "lg",
  style,
}: {
  children: React.ReactNode;
  padding?: Padding;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
        padding: PAD[padding],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  right,
  style,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        padding: "0.85rem 1.5rem",
        background: "var(--surface-2)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        fontWeight: 700,
        fontSize: "var(--font-sm)",
        ...style,
      }}
    >
      <span>{children}</span>
      {right}
    </div>
  );
}

export function CardBody({
  children,
  padding = "md",
  style,
}: {
  children: React.ReactNode;
  padding?: Padding;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ padding: PAD[padding], ...style }}>{children}</div>
  );
}
