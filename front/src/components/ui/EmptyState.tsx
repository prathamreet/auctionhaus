import * as React from "react";

export function EmptyState({
  title,
  hint,
  action,
  style,
}: {
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        padding: "3.5rem 2rem",
        textAlign: "center",
        background: "var(--surface)",
        border: "1px dashed var(--border-hard)",
        borderRadius: "var(--radius)",
        ...style,
      }}
    >
      <div
        style={{
          fontSize: "var(--font-sm)",
          fontWeight: 700,
          color: "var(--text)",
          marginBottom: hint ? "0.5rem" : 0,
        }}
      >
        {title}
      </div>
      {hint && (
        <div
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            lineHeight: 1.5,
            maxWidth: 380,
            margin: "0 auto",
          }}
        >
          {hint}
        </div>
      )}
      {action && (
        <div style={{ marginTop: "1.25rem" }}>{action}</div>
      )}
    </div>
  );
}
