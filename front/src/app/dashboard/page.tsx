"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";

const PREVIEW = 5;

export default function DashboardPage() {
  const { user, token } = useAuthStore();
  const router = useRouter();

  const qc = useQueryClient();

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    const sock = getSocket();
    const handleSync = () => {
      qc.refetchQueries({ queryKey: ["my-bids"] });
      qc.refetchQueries({ queryKey: ["my-auctions"] });
    };
    sock.on("auction:state-sync", handleSync);
    return () => { sock.off("auction:state-sync", handleSync); };
  }, [token, router, qc]);

  const { data: bidsData } = useQuery({
    queryKey: ["my-bids"],
    queryFn: () => api.get("/users/me/bids").then((r) => r.data.bids ?? []).catch(() => []),
    enabled: !!user,
    refetchInterval: 60000, // 60s — socket-driven pages update faster; dashboard is summary only
  });

  const { data: auctionsData } = useQuery({
    queryKey: ["my-auctions"],
    queryFn: () => api.get("/users/me/auctions").then((r) => r.data.auctions ?? []).catch(() => []),
    enabled: !!user,
    refetchInterval: 60000,
  });

  const { data: wonData } = useQuery({
    queryKey: ["my-won"],
    queryFn: () => api.get("/users/me/won").then((r) => r.data.auctions ?? []).catch(() => []),
    enabled: !!user,
    refetchInterval: 120000, // Won auctions change rarely
  });

  const activeBids =
    bidsData?.filter((b: { status: string }) =>
      ["WINNING", "ACTIVE"].includes(b.status)
    ) ?? [];
  const outbidBids =
    bidsData?.filter((b: { status: string }) => b.status === "OUTBID") ?? [];
  const wonBids =
    bidsData?.filter((b: { status: string }) => b.status === "WON") ?? [];

  if (!user) return null;

  const stats = [
    { label: "Active Bids", value: activeBids.length, color: "var(--accent)" },
    { label: "Outbid", value: outbidBids.length, color: "var(--text-soft)" },
    { label: "Auctions Won", value: wonData?.length ?? 0, color: "var(--success)" },
    { label: "My Listings", value: auctionsData?.length ?? 0, color: "var(--dutch)" },
  ];

  return (
    <div style={{ width: "100%", margin: "0", padding: "0 4vw 4vw", minHeight: "100vh" }}>
      {/* ── Header ── */}
      <div
        style={{
          padding: "3rem 0 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: "0.35rem",
            }}
          >
            Signed in as
          </div>
          <h1
            style={{
              fontSize: "var(--font-2xl)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              color: "var(--text)",
              lineHeight: 1,
            }}
          >
            {user.name}
          </h1>
          <div
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--muted)",
              marginTop: "0.3rem",
            }}
          >
            {user.email}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link
            href="/profile"
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "1.5px solid var(--border-hard)",
              padding: "0.6rem 1.25rem",
              fontWeight: 700,
              fontSize: "var(--font-sm)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              display: "inline-block",
            }}
          >
            Profile
          </Link>
          <Link
            href="/auctions/create"
            style={{
              background: "var(--accent)",
              color: "#fff",
              padding: "0.6rem 1.5rem",
              fontWeight: 700,
              fontSize: "var(--font-sm)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              display: "inline-block",
            }}
          >
            + New Listing
          </Link>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "1.5rem",
          padding: "0 0 2rem",
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              padding: "2rem",
              border: "1.5px solid var(--border-hard)",
              background: "var(--surface)",
            }}
          >
            <div
              style={{
                fontSize: "var(--font-xs)",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: "0.6rem",
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontSize: "2.75rem",
                fontWeight: 900,
                letterSpacing: "-0.05em",
                color: s.color,
                lineHeight: 1,
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sections ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <DashSection
            title="Active Bids"
            count={activeBids.length}
            allItems={activeBids}
            emptyMsg="No active bids — browse the auction catalogue."
            renderRow={(b: {
              id: string;
              amount: number;
              status: string;
              auction: { id: string; title: string; currentPrice: number; status: string };
            }) => <BidRow key={b.id} bid={b} />}
          />

          <DashSection
            title="Auctions Won"
            count={wonData?.length ?? 0}
            allItems={wonData ?? []}
            emptyMsg="Nothing won yet."
            renderRow={(a: {
              id: string;
              title: string;
              currentPrice: number;
              status: string;
            }) => <AuctionRow key={a.id} auction={a} forceStatus="WON" />}
          />

          {wonBids.length > 0 && (
            <div style={{ padding: "1rem 2rem", background: "var(--surface-2)", border: "1.5px solid var(--border-hard)", fontSize: "var(--font-xs)", color: "var(--text)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {wonBids.length} bid{wonBids.length !== 1 ? "s" : ""} marked as WON (payment auto-settled)
            </div>
          )}
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <DashSection
            title="My Listings"
            count={auctionsData?.length ?? 0}
            allItems={auctionsData ?? []}
            emptyMsg="No listings yet — create your first auction."
            renderRow={(a: {
              id: string;
              title: string;
              status: string;
              currentPrice: number;
              _count?: { bids: number };
            }) => <AuctionRow key={a.id} auction={a} />}
          />
        </div>
      </div>
    </div>
  );
}

function DashSection<T extends { id: string }>({
  title,
  count,
  allItems,
  emptyMsg,
  renderRow,
}: {
  title: string;
  count: number;
  allItems: T[];
  emptyMsg: string;
  renderRow: (item: T) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayed = expanded ? allItems : allItems.slice(0, PREVIEW);
  const hasMore = allItems.length > PREVIEW;

  return (
    <div style={{ border: "1.5px solid var(--border-hard)", background: "var(--surface)" }}>
      {/* Section header */}
      <div
        style={{
          padding: "1.25rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--surface-2)",
          borderBottom: "1.5px solid var(--border-hard)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: "var(--font-sm)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
            }}
          >
            {title}
          </span>
          <span
            style={{
              background: "var(--border-hard)",
              color: "#fff",
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              padding: "0.1rem 0.45rem",
              letterSpacing: "0.05em",
            }}
          >
            {count}
          </span>
        </div>

        {hasMore && (
          <button
            onClick={() => setExpanded((e) => !e)}
            style={{
              background: "none",
              border: "none",
              fontSize: "var(--font-xs)",
              color: "var(--accent)",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {expanded ? "SHOW LESS" : `VIEW ALL ${count}`}
          </button>
        )}
      </div>

      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto auto",
          padding: "0.4rem 2rem",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          fontSize: "var(--font-xs)",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        <span>Title</span>
        <span style={{ minWidth: 120, textAlign: "right" }}>Date</span>
        <span style={{ minWidth: 80, textAlign: "right" }}>Price</span>
        <span style={{ minWidth: 80, textAlign: "right" }}>Status</span>
      </div>

      {allItems.length === 0 ? (
        <EmptyRow message={emptyMsg} />
      ) : (
        displayed.map((item) => renderRow(item))
      )}

      {/* Collapsed indicator */}
      {hasMore && !expanded && (
        <div
          style={{
            padding: "0.6rem 2rem",
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border)",
            textAlign: "center",
            letterSpacing: "0.04em",
          }}
        >
          + {allItems.length - PREVIEW} more —{" "}
          <button
            onClick={() => setExpanded(true)}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "inherit",
              letterSpacing: "inherit",
              padding: 0,
            }}
          >
            View all
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "1.5rem 2rem",
        fontSize: "var(--font-sm)",
        color: "var(--muted)",
        background: "var(--surface)",
      }}
    >
      {message}
    </div>
  );
}

function BidRow({
  bid,
}: {
  bid: {
    id: string;
    amount: number;
    status: string;
    createdAt?: string;
    auction: { id: string; title: string; currentPrice: number; status: string };
  };
}) {
  // If the auction is ENDED and this bid was WINNING, escrow auto-settled so display it as WON
  const displayStatus =
    bid.status === "WINNING" && bid.auction?.status === "ENDED" ? "WON" : bid.status;
  const isWon = displayStatus === "WON" || displayStatus === "WINNING";
  return (
    <Link
      href={`/auctions/${bid.auction?.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        padding: "0.75rem 2rem",
        borderBottom: "1px solid var(--border)",
        fontSize: "var(--font-base)",
        background: displayStatus === "WON" ? "var(--surface-2)" : "var(--surface)",
        transition: "background 0.1s",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {bid.auction?.title}
        {displayStatus === "WON" && (
          <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", fontWeight: 800, color: "var(--text)", border: "1px solid var(--border-hard)", padding: "0.1rem 0.3rem" }}>WON</span>
        )}
      </span>
      <span
        style={{
          fontSize: "var(--font-xs)",
          color: "var(--muted)",
          minWidth: 120,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {bid.createdAt ? new Date(bid.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
      </span>
      <span
        style={{
          fontWeight: 700,
          color: "var(--accent)",
          minWidth: 80,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        ₹{bid.amount?.toLocaleString()}
      </span>
      <span
        style={{
          fontSize: "var(--font-xs)",
          color: isWon ? "var(--success)" : "var(--muted)",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          minWidth: 80,
          textAlign: "right",
        }}
      >
        {displayStatus}
      </span>
    </Link>
  );
}

function AuctionRow({
  auction,
  forceStatus,
}: {
  auction: {
    id: string;
    title: string;
    status: string;
    currentPrice: number;
    endTime?: string;
    winnerId?: string | null;
    _count?: { bids: number };
  };
  forceStatus?: string;
}) {
  let displayStatus = forceStatus ?? auction.status;
  if (!forceStatus && auction.status === "ENDED" && !auction.winnerId) {
    displayStatus = "UNSOLD";
  }

  const statusColor =
    displayStatus === "WON"
      ? "var(--success)"
      : displayStatus === "ACTIVE"
      ? "var(--success)"
      : displayStatus === "ENDED"
      ? "var(--muted)"
      : displayStatus === "UNSOLD"
      ? "var(--muted)"
      : "var(--warning)";

  return (
    <Link
      href={`/auctions/${auction.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        padding: "0.75rem 2rem",
        borderBottom: "1px solid var(--border)",
        fontSize: "var(--font-base)",
        background: displayStatus === "WON" ? "var(--surface-2)" : "var(--surface)",
        transition: "background 0.1s",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {displayStatus === "WON" && <span style={{ marginRight: "0.5rem", fontSize: "0.65rem", fontWeight: 800, color: "var(--text)", border: "1px solid var(--border-hard)", padding: "0.1rem 0.3rem" }}>WON</span>}
        {auction.title}
      </span>
      <span
        style={{
          fontSize: "var(--font-xs)",
          color: "var(--muted)",
          minWidth: 120,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {auction.endTime ? new Date(auction.endTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
      </span>
      <span
        style={{
          fontWeight: 700,
          color: "var(--text)",
          minWidth: 80,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        ₹{auction.currentPrice?.toLocaleString()}
      </span>
      <span
        style={{
          fontSize: "var(--font-xs)",
          color: statusColor,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          minWidth: 80,
          textAlign: "right",
        }}
      >
        {displayStatus}
      </span>
    </Link>
  );
}
