import * as React from "react";

export function formatMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

export function Money({
  value,
  size = "md",
  color,
  style,
}: {
  value: number | null | undefined;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  color?: string;
  style?: React.CSSProperties;
}) {
  const fontSize =
    size === "xl"
      ? "var(--font-3xl)"
      : size === "lg"
      ? "var(--font-2xl)"
      : size === "md"
      ? "var(--font-xl)"
      : size === "sm"
      ? "var(--font-base)"
      : "var(--font-xs)";
  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
        fontSize,
        color: color ?? "var(--text)",
        ...style,
      }}
    >
      {formatMoney(value)}
    </span>
  );
}
