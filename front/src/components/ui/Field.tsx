import * as React from "react";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  style,
  className,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  htmlFor?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div style={style} className={className}>
      {(label || hint) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "0.35rem",
          }}
        >
          {label && (
            <label
              htmlFor={htmlFor}
              style={{
                fontSize: "var(--font-xs)",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              {label}
            </label>
          )}
          {hint && !error && (
            <span
              style={{
                fontSize: "var(--font-xs)",
                color: "var(--muted)",
              }}
            >
              {hint}
            </span>
          )}
        </div>
      )}
      {children}
      {error && (
        <p
          style={{
            margin: "0.35rem 0 0",
            fontSize: "var(--font-xs)",
            fontWeight: 600,
            color: "var(--danger)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
