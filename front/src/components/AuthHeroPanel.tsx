import * as React from "react";

export function AuthHeroPanel({
  heading,
  body,
}: {
  heading: React.ReactNode;
  body: string;
}) {
  return (
    <div
      style={{
        background: "var(--text)",
        color: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "clamp(2rem, 5vw, 3.5rem)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            marginBottom: "3rem",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              background: "var(--accent)",
              borderRadius: 2,
            }}
          />
          <span style={{ fontWeight: 700, fontSize: "var(--font-base)" }}>
            AuctionHaus
          </span>
        </div>

        <h2
          style={{
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            fontWeight: 700,
            lineHeight: 0.95,
            marginBottom: "1.5rem",
            letterSpacing: "-0.03em",
          }}
        >
          {heading}
        </h2>

        <p
          style={{
            fontSize: "var(--font-base)",
            color: "color-mix(in srgb, var(--bg) 70%, transparent)",
            lineHeight: 1.6,
            maxWidth: 360,
          }}
        >
          {body}
        </p>
      </div>

      <div
        style={{
          fontSize: "var(--font-xs)",
          color: "color-mix(in srgb, var(--bg) 50%, transparent)",
          letterSpacing: "0.05em",
        }}
      >
        CSE Major Project · Real-Time Platform
      </div>
    </div>
  );
}
