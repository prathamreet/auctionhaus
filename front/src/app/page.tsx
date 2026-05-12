import Link from "next/link";

export default function Home() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - var(--navbar-h))",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* ── CORE GRID ── */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1.25fr 0.75fr",
          borderBottom: "1px solid var(--text)",
        }}
      >
        {/* Left Segment: Hero */}
        <div
          style={{
            padding: "var(--pad) 4rem 3rem 4rem",
            borderRight: "1px solid var(--text)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            {/* System Status */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "4rem",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  background: "var(--accent)",
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--text)",
                }}
              >
                Operational / Sync: Active
              </span>
            </div>

            <h1
              style={{
                fontSize: "clamp(4.5rem, 12vw, 9rem)",
                fontWeight: 900,
                letterSpacing: "-0.07em",
                lineHeight: 0.82,
                color: "var(--text)",
                marginBottom: "4rem",
                textTransform: "uppercase",
              }}
            >
              Bid.
              <br />
              Win.
              <br />
              <span style={{ color: "var(--accent)" }}>Transact.</span>
            </h1>

            <p
              style={{
                fontSize: "1.15rem",
                color: "var(--text)",
                lineHeight: 1.35,
                maxWidth: 440,
                marginBottom: "4rem",
                fontWeight: 500,
              }}
            >
              A high-frequency auction platform supporting multi-protocol bidding 
              engines. Engineered for zero-lag synchronization and algorithmic 
              auto-participation.
            </p>

            <div style={{ display: "flex", gap: "0" }}>
              <Link
                href="/auctions"
                style={{
                  background: "var(--text)",
                  color: "var(--bg)",
                  padding: "1.5rem 3rem",
                  fontWeight: 800,
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  border: "1px solid var(--text)",
                }}
              >
                Access Market
              </Link>
              <Link
                href="/register"
                style={{
                  background: "transparent",
                  color: "var(--text)",
                  padding: "1.5rem 3rem",
                  fontWeight: 800,
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  border: "1px solid var(--text)",
                  borderLeft: "none",
                }}
              >
                Open Account
              </Link>
            </div>
          </div>

          {/* Logic Summary */}
          <div
            style={{
              marginTop: "4rem",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              borderTop: "1px solid var(--text)",
              paddingTop: "2rem",
            }}
          >
            {[
              { n: "01", label: "English Engine" },
              { n: "02", label: "Dutch Drop" },
              { n: "03", label: "Sealed Logic" },
            ].map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 900,
                    color: "var(--text)",
                    letterSpacing: "-0.04em",
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--muted)",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    marginTop: "0.3rem",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Segment: Specs */}
        <div
          style={{
            display: "grid",
            gridTemplateRows: "repeat(3, 1fr)",
          }}
        >
          {[
            {
              title: "Synchronized Bidding",
              desc: "Real-time state updates powered by the AH-Sync engine for zero-conflict transactions.",
              ref: "REF_001",
            },
            {
              title: "Automated Escrow",
              desc: "Atomic wallet logic ensuring all assets are backed and secured during active auctions.",
              ref: "REF_002",
            },
            {
              title: "Global Marketplace",
              desc: "Cross-format support for high-stakes digital and physical asset liquidation.",
              ref: "REF_003",
            },
          ].map((item, i) => (
            <div
              key={item.ref}
              style={{
                padding: "3.5rem",
                borderBottom: i < 2 ? "1px solid var(--text)" : "none",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "var(--accent)",
                  marginBottom: "1.5rem",
                }}
              >
                {item.ref}
              </div>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "-0.04em",
                  color: "var(--text)",
                  marginBottom: "1rem",
                  lineHeight: 1,
                }}
              >
                {item.title}
              </div>
              <div
                style={{
                  fontSize: "0.95rem",
                  color: "var(--text-soft)",
                  lineHeight: 1.5,
                  maxWidth: "280px",
                  fontWeight: 500,
                }}
              >
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DATA FOOTER ── */}
      <div
        style={{
          padding: "1.5rem 4rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--text)",
          color: "var(--bg)",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 800,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          AuctionHaus / Protocol 1.0.4
        </span>
        <div style={{ display: "flex", gap: "2rem" }}>
          <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.6 }}>
            LATENCY: 14MS
          </span>
          <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.6 }}>
            UPTIME: 99.9%
          </span>
        </div>
      </div>
    </div>
  );
}
