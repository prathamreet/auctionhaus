"use client";
import * as React from "react";
import { Alert, Badge, Money } from "@/components/ui";

export function WinnerCertificate({
  auction,
  isWinner,
  isSeller,
}: {
  auction: {
    id: string;
    title: string;
    currentPrice: number;
    endTime: string;
    winner?: { id: string; name: string };
    seller?: { id: string; name: string };
  };
  isWinner: boolean;
  isSeller: boolean;
}) {
  const winnerName =
    auction.winner?.name ?? auction.seller?.name ?? "Winner";
  const verificationCode = `AH-${auction.id
    .slice(0, 8)
    .toUpperCase()}-${new Date(auction.endTime).getFullYear()}`;

  return (
    <div
      style={{
        border: `2px solid ${isWinner ? "var(--success)" : "var(--accent)"}`,
        background: isWinner
          ? "color-mix(in srgb, var(--success) 6%, transparent)"
          : "color-mix(in srgb, var(--accent) 6%, transparent)",
        padding: "1.25rem",
        borderRadius: "var(--radius)",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.85rem",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "var(--font-sm)",
              color: isWinner ? "var(--success)" : "var(--accent)",
            }}
          >
            {isWinner ? "You won!" : "Auction winner"}
          </div>
          <div
            style={{
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
              fontWeight: 600,
            }}
          >
            {isSeller
              ? "Show this to verify the winner"
              : "Show this to the seller"}
          </div>
        </div>
        <Badge tone={isWinner ? "success" : "accent"}>CERTIFIED</Badge>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "0.85rem",
          marginBottom: "0.85rem",
          fontSize: "var(--font-xs)",
          borderRadius: "var(--radius)",
        }}
      >
        <CertRow label="Winner" value={winnerName} />
        <CertRow label="Item" value={auction.title} strong />
        <CertRow
          label="Winning bid"
          value={
            <Money
              value={auction.currentPrice}
              size="sm"
              color={isWinner ? "var(--success)" : "var(--accent)"}
            />
          }
        />
        <CertRow
          label="Date"
          value={new Date(auction.endTime).toLocaleDateString([], {
            dateStyle: "long",
          })}
        />
        <div
          style={{
            marginTop: "0.5rem",
            paddingTop: "0.5rem",
            borderTop: "1px dashed var(--border)",
            fontWeight: 700,
            color: "var(--muted)",
            fontSize: "var(--font-xs)",
            fontFamily: "monospace",
            letterSpacing: "0.04em",
          }}
        >
          {verificationCode}
        </div>
      </div>

      {!isWinner && (
        <>
          <Alert tone="success" style={{ marginBottom: "0.5rem" }}>
            Payment auto-settled via escrow
          </Alert>
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              padding: "0.85rem",
              fontSize: "var(--font-xs)",
              borderRadius: "var(--radius)",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "var(--muted)",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Delivery steps
            </div>
            <ol
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                lineHeight: 1.7,
                color: "var(--text-soft)",
              }}
            >
              <li>
                <Money value={auction.currentPrice} size="xs" /> has been
                credited to your wallet
              </li>
              <li>Winner will contact you with their verification code</li>
              <li>
                Verify the code starts with{" "}
                <strong className="mono">
                  AH-{auction.id.slice(0, 8).toUpperCase()}
                </strong>
              </li>
              <li>Arrange delivery and mark complete</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

function CertRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        marginBottom: 4,
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <span style={{ color: "var(--muted)", fontWeight: 600 }}>{label}</span>
      <span
        style={{
          fontWeight: strong ? 700 : 600,
          textAlign: "right",
          maxWidth: "60%",
        }}
      >
        {value}
      </span>
    </div>
  );
}
