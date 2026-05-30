import * as React from "react";

export interface TabItem {
  key: string;
  label: React.ReactNode;
  count?: number;
  countTone?: "neutral" | "accent" | "danger";
}

export function Tabs({
  items,
  active,
  onChange,
  style,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 0,
        borderBottom: "1px solid var(--border)",
        background: "transparent",
        ...style,
      }}
    >
      {items.map((tab) => {
        const isActive = tab.key === active;
        const tone = tab.countTone ?? "neutral";
        const countBg =
          tone === "danger"
            ? "var(--danger)"
            : tone === "accent"
            ? "var(--accent)"
            : "var(--border-hard)";
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            style={{
              padding: "0.85rem 1.25rem",
              fontWeight: 700,
              fontSize: "var(--font-sm)",
              background: "none",
              border: "none",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              color: isActive ? "var(--accent)" : "var(--muted)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              transition: "color 0.12s",
            }}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span
                style={{
                  background: countBg,
                  color: "#fff",
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  padding: "0.05rem 0.4rem",
                  borderRadius: 999,
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
