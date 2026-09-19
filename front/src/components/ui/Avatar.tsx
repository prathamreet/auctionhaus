"use client";
import * as React from "react";

/**
 * User avatar. Renders the user's image when `src` is a usable URL, otherwise
 * falls back to monogram initials on a solid tile. A broken image URL also
 * falls back to initials (onError). The `avatar` field is backend-supported
 * (User.avatar) but was previously never surfaced in the UI.
 */
export function Avatar({
  name,
  src,
  size = 32,
  style,
}: {
  name: string;
  src?: string | null;
  size?: number;
  style?: React.CSSProperties;
}) {
  const [errored, setErrored] = React.useState(false);
  // A new src is worth re-attempting even if a previous one failed.
  React.useEffect(() => setErrored(false), [src]);

  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const showImg = !!src && !errored;

  return (
    <span
      aria-hidden={false}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "var(--text)",
        color: "var(--bg)",
        fontWeight: 700,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        letterSpacing: "-0.01em",
        userSelect: "none",
        ...style,
      }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars are
        // arbitrary user-supplied URLs; next/image would require per-host
        // remotePatterns config we deliberately avoid.
        <img
          src={src as string}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials
      )}
    </span>
  );
}
