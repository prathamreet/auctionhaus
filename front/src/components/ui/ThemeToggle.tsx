"use client";
import * as React from "react";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem("ah_theme");
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

export function ThemeToggle({ style }: { style?: React.CSSProperties }) {
  const [theme, setTheme] = React.useState<Theme>("system");

  React.useEffect(() => {
    const stored = readStored();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  const cycle = () => {
    const next: Theme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    applyTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ah_theme", next);
    }
  };

  const label =
    theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Auto";

  return (
    <button
      onClick={cycle}
      title={`Theme: ${label} (click to cycle)`}
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        color: "var(--text-soft)",
        padding: "0.4rem 0.7rem",
        fontSize: "var(--font-xs)",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export function ThemeBootstrap() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem('ah_theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
      }}
    />
  );
}
