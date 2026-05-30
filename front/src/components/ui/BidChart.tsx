"use client";
import * as React from "react";

export interface BidPoint {
  t: number;
  amount: number;
  isAutoBid?: boolean;
}

export function BidChart({
  bids,
  startingPrice,
  height = 220,
  ariaLabel = "Bid price over time",
}: {
  bids: BidPoint[];
  startingPrice?: number;
  height?: number;
  ariaLabel?: string;
}) {
  const cleaned = React.useMemo(
    () =>
      bids
        .filter((b) => b.amount != null && !isNaN(b.amount) && b.t > 0)
        .sort((a, b) => a.t - b.t),
    [bids]
  );

  if (cleaned.length < 2) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          fontSize: "var(--font-xs)",
          background: "var(--surface-2)",
          borderRadius: "var(--radius)",
        }}
      >
        Chart appears after 2+ bids
      </div>
    );
  }

  const minT = cleaned[0].t;
  const maxT = cleaned[cleaned.length - 1].t;
  const amounts = cleaned.map((b) => b.amount);
  const minA = Math.min(...amounts, startingPrice ?? Infinity);
  const maxA = Math.max(...amounts);
  const padA = Math.max((maxA - minA) * 0.08, 1);
  const yMin = minA - padA;
  const yMax = maxA + padA;

  const W = 800;
  const H = height;
  const PAD_L = 56;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const tSpan = maxT === minT ? 1 : maxT - minT;
  const aSpan = yMax === yMin ? 1 : yMax - yMin;

  const sx = (t: number) => PAD_L + ((t - minT) / tSpan) * innerW;
  const sy = (a: number) => PAD_T + innerH - ((a - yMin) / aSpan) * innerH;

  const path = cleaned
    .map((b, i) => `${i === 0 ? "M" : "L"}${sx(b.t).toFixed(1)},${sy(b.amount).toFixed(1)}`)
    .join(" ");

  const area =
    `M${sx(cleaned[0].t).toFixed(1)},${(PAD_T + innerH).toFixed(1)} ` +
    cleaned
      .map((b) => `L${sx(b.t).toFixed(1)},${sy(b.amount).toFixed(1)}`)
      .join(" ") +
    ` L${sx(cleaned[cleaned.length - 1].t).toFixed(1)},${(PAD_T + innerH).toFixed(1)} Z`;

  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round(yMin + (aSpan * i) / yTicks)
  );

  const xTickCount = Math.min(5, cleaned.length);
  const xTickIdx = Array.from({ length: xTickCount }, (_, i) =>
    Math.floor((cleaned.length - 1) * (i / Math.max(1, xTickCount - 1)))
  );

  const fmtMoney = (n: number) => {
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
    return `₹${Math.round(n)}`;
  };

  const fmtTime = (t: number) => {
    const d = new Date(t);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {yTickVals.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={sy(v)}
            y2={sy(v)}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={PAD_L - 8}
            y={sy(v) + 4}
            textAnchor="end"
            fontSize={10}
            fill="var(--muted)"
            fontFamily="inherit"
          >
            {fmtMoney(v)}
          </text>
        </g>
      ))}

      {startingPrice != null && startingPrice >= yMin && startingPrice <= yMax && (
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={sy(startingPrice)}
          y2={sy(startingPrice)}
          stroke="var(--muted)"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.6}
        />
      )}

      <path d={area} fill="var(--accent)" opacity={0.1} />
      <path
        d={path}
        stroke="var(--accent)"
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {cleaned.map((b, i) => (
        <circle
          key={i}
          cx={sx(b.t)}
          cy={sy(b.amount)}
          r={b.isAutoBid ? 3 : 3.5}
          fill={b.isAutoBid ? "var(--surface)" : "var(--accent)"}
          stroke="var(--accent)"
          strokeWidth={1.5}
        >
          <title>
            {fmtMoney(b.amount)} at{" "}
            {new Date(b.t).toLocaleString([], {
              dateStyle: "short",
              timeStyle: "medium",
            })}
            {b.isAutoBid ? " (auto)" : ""}
          </title>
        </circle>
      ))}

      {xTickIdx.map((idx, i) => (
        <text
          key={i}
          x={sx(cleaned[idx].t)}
          y={H - 8}
          textAnchor={i === 0 ? "start" : i === xTickIdx.length - 1 ? "end" : "middle"}
          fontSize={10}
          fill="var(--muted)"
          fontFamily="inherit"
        >
          {fmtTime(cleaned[idx].t)}
        </text>
      ))}
    </svg>
  );
}
