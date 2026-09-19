"use client";
import * as React from "react";

/**
 * Auction item image. Renders `src` (cover-fit) when present and loadable;
 * otherwise renders `fallback` (default: nothing). A broken URL falls back the
 * same way via onError. The `imageUrl` field is backend-supported
 * (Auction.imageUrl) and returned by the catalogue/detail reads but was
 * previously never rendered.
 *
 * Sizing is left entirely to the caller via `style`/`className` so the same
 * component serves the detail hero, catalogue banner, and list thumbnails.
 */
export function AuctionImage({
  src,
  alt,
  fallback = null,
  style,
  className,
}: {
  src?: string | null;
  alt: string;
  fallback?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [errored, setErrored] = React.useState(false);
  React.useEffect(() => setErrored(false), [src]);

  if (!src || errored) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- auction images are
    // arbitrary user-supplied URLs; next/image would require per-host
    // remotePatterns config we deliberately avoid.
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        background: "var(--surface-2)",
        ...style,
      }}
    />
  );
}
