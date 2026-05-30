import * as React from "react";

type Variant = "primary" | "ghost" | "danger" | "success" | "subtle" | "dutch";
type Size = "sm" | "md" | "lg";

const VARIANT_STYLES: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "#fff",
    border: "1px solid var(--accent)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--border-hard)",
  },
  danger: {
    background: "transparent",
    color: "var(--danger)",
    border: "1px solid var(--danger)",
  },
  success: {
    background: "var(--success)",
    color: "#fff",
    border: "1px solid var(--success)",
  },
  subtle: {
    background: "var(--surface-2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
  },
  dutch: {
    background: "var(--dutch)",
    color: "#fff",
    border: "1px solid var(--dutch)",
  },
};

const SIZE_STYLES: Record<Size, React.CSSProperties> = {
  sm: { padding: "0.45rem 0.85rem", fontSize: "var(--font-xs)" },
  md: { padding: "0.65rem 1.15rem", fontSize: "var(--font-sm)" },
  lg: { padding: "0.9rem 1.4rem", fontSize: "var(--font-base)" },
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  loading,
  disabled,
  style,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...rest}
      disabled={isDisabled}
      style={{
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
        borderRadius: "var(--radius)",
        fontWeight: 600,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.55 : 1,
        width: fullWidth ? "100%" : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.4rem",
        transition: "opacity 0.12s, filter 0.12s",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {loading ? "..." : children}
    </button>
  );
}
