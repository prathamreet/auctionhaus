import * as React from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
  style,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <header
      style={{
        padding: "3rem 0 2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: "1rem",
        flexWrap: "wrap",
        ...style,
      }}
    >
      <div>
        {eyebrow && (
          <div
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              color: "var(--muted)",
              marginBottom: "0.35rem",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          style={{
            fontSize: "var(--font-2xl)",
            fontWeight: 600,
            lineHeight: 1,
            color: "var(--text)",
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--muted)",
              marginTop: "0.4rem",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </header>
  );
}

export function Toolbar({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.6rem",
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: "1.5rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PageShell({
  children,
  maxWidth,
  style,
}: {
  children: React.ReactNode;
  maxWidth?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: maxWidth ?? "100%",
        margin: "0 auto",
        padding: "0 4vw 4vw",
        minHeight: "100vh",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
