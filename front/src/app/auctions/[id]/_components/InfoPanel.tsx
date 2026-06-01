"use client";
import * as React from "react";
import { Card, Money } from "@/components/ui";

const TYPE_INFO: Record<
  string,
  { title: string; desc: string; rules: (auction: AuctionForInfo) => string[] }
> = {
  ENGLISH: {
    title: "English auction",
    desc: "Open ascending-bid format. Bidders compete by placing progressively higher bids; highest bid when time expires wins.",
    rules: (a) => [
      `Each bid must be ≥ ₹${a.minIncrement} above the current price`,
      "If you get outbid you are notified instantly",
      a.antiSnipingMins > 0
        ? `Last ${a.antiSnipingMins} min bids extend the timer`
        : "Anti-sniping disabled",
    ],
  },
  DUTCH: {
    title: "Dutch auction",
    desc: "Price starts high and drops automatically at regular intervals. The first bidder to accept the current price wins immediately.",
    rules: () => [
      "Price only goes DOWN over time",
      "Click ‘Accept’ to win at the displayed price",
      "First to accept wins — no further bidding",
    ],
  },
  SEALED_BID: {
    title: "Sealed-bid auction",
    desc: "Everyone submits one private bid without seeing others’. After the auction ends all bids are revealed and the highest wins.",
    rules: () => [
      "Bidder names are hidden until the auction ends",
      "You get one bid — choose carefully",
      "Highest bid wins at the winning price",
    ],
  },
};

export interface AuctionForInfo {
  type: "ENGLISH" | "DUTCH" | "SEALED_BID";
  minIncrement: number;
  antiSnipingMins: number;
  dutchPriceStep?: number;
  dutchInterval?: number;
  autoAcceptAmount?: number;
  endTime: string;
  startingPrice: number;
  reservePrice: number;
  buyNowPrice?: number;
}

export function KeyDetails({ auction }: { auction: AuctionForInfo }) {
  const items =
    auction.type === "DUTCH"
      ? [
          { label: "Starting price", value: <Money value={auction.startingPrice} size="sm" /> },
          { label: "Reserve price", value: auction.reservePrice ? <Money value={auction.reservePrice} size="sm" /> : "—" },
          { label: "Drop step", value: auction.dutchPriceStep ? <Money value={auction.dutchPriceStep} size="sm" /> : "—" },
          { label: "Interval", value: auction.dutchInterval ? `${auction.dutchInterval}s` : "—" },
        ]
      : [
          { label: "Starting price", value: <Money value={auction.startingPrice} size="sm" /> },
          { label: "Reserve price", value: auction.reservePrice ? <Money value={auction.reservePrice} size="sm" /> : "—" },
          { label: "Min increment", value: <Money value={auction.minIncrement} size="sm" /> },
          { label: "Buy now", value: auction.buyNowPrice ? <Money value={auction.buyNowPrice} size="sm" /> : "—" },
        ];
  return (
    <Card padding="none">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
        }}
      >
        {items.map((item, i) => (
          <div
            key={item.label}
            style={{
              padding: "1rem 1.25rem",
              borderRight: i < items.length - 1 ? "1px solid var(--border)" : undefined,
            }}
          >
            <div
              style={{
                fontSize: "var(--font-xs)",
                fontWeight: 700,
                color: "var(--muted)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {item.label}
            </div>
            <div style={{ fontWeight: 700, fontSize: "var(--font-sm)" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function InfoPanel({
  auction,
  effectiveEndTime,
}: {
  auction: AuctionForInfo;
  effectiveEndTime: string;
}) {
  const info = TYPE_INFO[auction.type];
  if (!info) return null;
  const rules = info.rules(auction);

  const meta =
    auction.type === "DUTCH"
      ? [
          { label: "Drop step", value: auction.dutchPriceStep ? <Money value={auction.dutchPriceStep} size="sm" /> : "—" },
          {
            label: "Drop interval",
            value: auction.dutchInterval ? `${auction.dutchInterval}s` : "—",
          },
          {
            label: "Auto-accept at",
            value: auction.autoAcceptAmount ? (
              <Money value={auction.autoAcceptAmount} size="sm" />
            ) : (
              "Not set"
            ),
          },
          {
            label: "Ends",
            value: new Date(effectiveEndTime).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          },
        ]
      : [
          {
            label: "Anti-sniping",
            value:
              auction.antiSnipingMins > 0
                ? `${auction.antiSnipingMins}m extension on late bids`
                : "Disabled",
          },
          {
            label: "Ends",
            value: new Date(effectiveEndTime).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          },
        ];

  return (
    <Card padding="lg">
      <div
        style={{
          fontWeight: 700,
          fontSize: "var(--font-sm)",
          marginBottom: "1rem",
          paddingBottom: "0.75rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        Auction details
      </div>

      <div
        style={{
          padding: "0.85rem",
          background: "var(--surface-2)",
          borderRadius: "var(--radius)",
          marginBottom: "1rem",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "var(--font-sm)", marginBottom: 4 }}>
          {info.title}
        </div>
        <p
          style={{
            fontSize: "var(--font-xs)",
            color: "var(--text-soft)",
            lineHeight: 1.55,
            marginBottom: "0.75rem",
          }}
        >
          {info.desc}
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rules.map((rule, i) => (
            <li
              key={i}
              style={{
                fontSize: "var(--font-xs)",
                color: "var(--muted)",
                paddingLeft: "0.9rem",
                position: "relative",
                marginBottom: 4,
                lineHeight: 1.5,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  color: "var(--accent)",
                  fontWeight: 700,
                }}
              >
                ·
              </span>
              {rule}
            </li>
          ))}
        </ul>
      </div>

      {meta.map((item) => (
        <div
          key={item.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.4rem 0",
            fontSize: "var(--font-sm)",
            borderBottom: "1px dashed var(--border)",
          }}
        >
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>
            {item.label}
          </span>
          <span style={{ fontWeight: 600 }}>{item.value}</span>
        </div>
      ))}
    </Card>
  );
}
