import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - var(--navbar-h))",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <section
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            padding: "clamp(2rem, 6vw, 5rem) clamp(1.5rem, 5vw, 4rem)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "3rem",
            background: "var(--surface)",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                marginBottom: "3.5rem",
                fontSize: "var(--font-xs)",
                fontWeight: 700,
                color: "var(--text-soft)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              <span className="live-dot" />
              Real-time auction protocol
            </div>

            <h1
              style={{
                fontSize: "clamp(3rem, 10vw, 7.5rem)",
                fontWeight: 700,
                lineHeight: 0.92,
                letterSpacing: "-0.04em",
                color: "var(--text)",
                marginBottom: "2.5rem",
              }}
            >
              Bid.
              <br />
              Win.
              <br />
              <span style={{ color: "var(--accent)" }}>Settle.</span>
            </h1>

            <p
              style={{
                fontSize: "var(--font-md)",
                color: "var(--text-soft)",
                lineHeight: 1.55,
                maxWidth: 440,
                marginBottom: "2.5rem",
                fontWeight: 500,
              }}
            >
              English, Dutch, and sealed-bid auctions on one streaming engine.
              Atomic escrow, server-resolved auto-bids, and a transactional bid
              ladder you can trust enough to defend in a viva.
            </p>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <Link href="/auctions" style={{ textDecoration: "none" }}>
                <Button size="lg">Browse the market →</Button>
              </Link>
              <Link href="/register" style={{ textDecoration: "none" }}>
                <Button size="lg" variant="ghost">
                  Open an account
                </Button>
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              borderTop: "1px solid var(--border)",
              paddingTop: "2rem",
              gap: "1rem",
            }}
          >
            {[
              { n: "01", label: "English Engine", hint: "Ascending bids, anti-snipe, buy-now" },
              { n: "02", label: "Dutch Drop", hint: "Falling price ladder, first to accept wins" },
              { n: "03", label: "Sealed Logic", hint: "Private bids until close, masked while live" },
            ].map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontSize: "1.6rem",
                    fontWeight: 700,
                    color: "var(--text)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    fontSize: "var(--font-xs)",
                    color: "var(--text)",
                    fontWeight: 700,
                    marginTop: "0.3rem",
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: "var(--font-xs)",
                    color: "var(--muted)",
                    marginTop: "0.2rem",
                    lineHeight: 1.45,
                  }}
                >
                  {s.hint}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateRows: "repeat(3, 1fr)" }}>
          {[
            {
              title: "Synchronized bidding",
              desc: "Socket.io rooms with per-auction state sync; reconnects re-fetch via TanStack Query without losing place.",
              ref: "REF_001",
            },
            {
              title: "Atomic escrow",
              desc: "Pessimistic FOR UPDATE row locks on auctions and wallets, decimal money end-to-end, and a single Settlement row guarding double-pays.",
              ref: "REF_002",
            },
            {
              title: "Server-resolved auto-bids",
              desc: "Auto-bid ladder runs in one transaction — every increment shows in the bid log, no wall-clock simulation.",
              ref: "REF_003",
            },
          ].map((item, i) => (
            <div
              key={item.ref}
              style={{
                padding: "2.5rem",
                borderBottom: i < 2 ? "1px solid var(--border)" : "none",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                background: i % 2 === 0 ? "var(--bg)" : "var(--surface-2)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  color: "var(--accent)",
                  marginBottom: "1rem",
                  letterSpacing: "0.05em",
                }}
              >
                {item.ref}
              </div>
              <div
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: "0.6rem",
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                }}
              >
                {item.title}
              </div>
              <div
                style={{
                  fontSize: "var(--font-sm)",
                  color: "var(--text-soft)",
                  lineHeight: 1.55,
                  maxWidth: 320,
                }}
              >
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div
        style={{
          padding: "1.25rem clamp(1.5rem, 5vw, 4rem)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--text)",
          color: "var(--bg)",
          fontSize: "var(--font-xs)",
          fontWeight: 600,
          letterSpacing: "0.04em",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <span>AuctionHaus / Protocol 1.0.4</span>
        <div style={{ display: "flex", gap: "2rem", opacity: 0.65, flexWrap: "wrap" }}>
          <span>NODE 18 + POSTGRES 15</span>
          <span>REDIS STREAMS + SOCKET.IO</span>
          <span>NEW HORIZON COE</span>
        </div>
      </div>
    </div>
  );
}
