import * as React from "react";

export function Skeleton({
  width,
  height = 16,
  radius = 4,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        width: width ?? "100%",
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, var(--surface-2) 0%, var(--border) 50%, var(--surface-2) 100%)",
        backgroundSize: "200% 100%",
        animation: "ah-shimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonText({
  lines = 1,
  width,
}: {
  lines?: number;
  width?: number | string;
}) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={
            width ?? (i === lines - 1 && lines > 1 ? "60%" : "100%")
          }
          height={14}
        />
      ))}
    </span>
  );
}

export function SkeletonCard({
  rows = 3,
  style,
}: {
  rows?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        ...style,
      }}
    >
      <Skeleton width="40%" height={18} />
      <Skeleton width="80%" height={28} />
      <div style={{ height: 12 }} />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} width={i % 2 === 0 ? "100%" : "70%"} height={12} />
      ))}
    </div>
  );
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 12,
        padding: "0.85rem 1.5rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {Array.from({ length: cols }, (_, i) => (
        <Skeleton key={i} height={14} width={i === 0 ? "80%" : "50%"} />
      ))}
    </div>
  );
}

export function SkeletonGrid({
  count = 6,
  minWidth = 320,
}: {
  count?: number;
  minWidth?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
        gap: "1.5rem",
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} rows={3} />
      ))}
    </div>
  );
}
