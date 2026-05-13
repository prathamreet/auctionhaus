"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { getSocket } from "@/lib/socket";

interface Auction {
  id: string;
  title: string;
  type: "ENGLISH" | "DUTCH" | "SEALED_BID";
  status: string;
  currentPrice: number;
  startingPrice: number;
  endTime: string;
  winnerId?: string | null;
  seller: { id: string; name: string };
  _count?: { bids: number };
}

export default function AuctionsPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const { user } = useAuthStore();
  const qc = useQueryClient();

  useEffect(() => {
    const sock = getSocket();
    const handleSync = () => {
      qc.refetchQueries({ queryKey: ["auctions"] });
    };
    sock.on("auction:state-sync", handleSync);
    return () => { sock.off("auction:state-sync", handleSync); };
  }, [qc]);

  const { data, isLoading } = useQuery({
    queryKey: ["auctions", search, type, statusFilter, page],
    queryFn: () =>
      api
        .get("/auctions", {
          params: {
            search: search || undefined,
            type: type || undefined,
            status: statusFilter === "ALL" ? undefined : statusFilter,
            page,
            limit: 12 } })
        .then((r) => r.data) });

  // Fetch user's watchlist so cards know their status
  const { data: watchlistData } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () =>
      api
        .get("/watchlist")
        .then((r) => r.data.watchlist ?? [])
        .catch(() => []),
    enabled: !!user });

  const watchedIds = new Set<string>(
    ((watchlistData ?? []) as { auctionId: string }[]).map((w) => w.auctionId)
  );

  const toggleWatchlist = async (e: React.MouseEvent, auctionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (watchedIds.has(auctionId)) {
      await api.delete(`/watchlist/${auctionId}`).catch(() => null);
    } else {
      await api.post("/watchlist", { auctionId }).catch(() => null);
    }
    qc.invalidateQueries({ queryKey: ["watchlist"] });
  };

  const auctions: Auction[] = data?.auctions ?? [];

  return (
    <div style={{ width: "100%", margin: "0", padding: "0 4vw 4vw", minHeight: "100vh" }}>
      {/* ── Page Header ── */}
      <div
        style={{
          padding: "3rem 0 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
          flexWrap: "wrap" }}
      >
        <div>
          <div
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 700,


              color: "var(--accent)",
              marginBottom: "0.4rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem" }}
          >
            <span className="live-dot" />
            &nbsp;Live Auctions
          </div>
          <h1
            style={{
              fontSize: "var(--font-2xl)",
              fontWeight: 600,

              lineHeight: 1,
              color: "var(--text)" }}
          >
            Auction Catalogue
          </h1>
        </div>

        {user && (
          <Link
            href="/auctions/create"
            style={{
              background: "var(--accent)",
              color: "#fff",
              padding: "0.6rem 1.5rem",
              fontWeight: 700,
              fontSize: "var(--font-sm)",


              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem" }}
          >
            + New Listing
          </Link>
        )}
      </div>

      {/* ── Filter Bar ── */}
      <div
        style={{
          display: "flex",
          gap: "0",
          padding: "0 0 2rem",
          alignItems: "stretch" }}
      >
        <input
          placeholder="Search auctions..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            maxWidth: 280,
            borderRight: "none" }}
        />
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          style={{
            maxWidth: 160,
            borderRight: "none" }}
        >
          <option value="">All Types</option>
          <option value="ENGLISH">English</option>
          <option value="DUTCH">Dutch</option>
          <option value="SEALED_BID">Sealed Bid</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{
            maxWidth: 160,
            borderRadius: "var(--radius)" }}
        >
          <option value="ACTIVE">Active</option>
          <option value="ENDED">Past (Ended)</option>
          <option value="ALL">All Status</option>
        </select>

        {/* Result count */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "var(--font-sm)",
            color: "var(--muted)" }}
        >
          {isLoading
            ? "Loading..."
            : `${auctions.length} lot${auctions.length !== 1 ? "s" : ""}`}
        </div>
      </div>

      {/* ── Catalogue Grid ── */}
      {isLoading ? (
        <div style={{ padding: "4rem 0", textAlign: "center", color: "var(--muted)" }}>
          <div style={{ fontSize: "var(--font-lg)", fontWeight: 700, marginBottom: "0.5rem" }}>
            Loading catalogue...
          </div>
        </div>
      ) : auctions.length === 0 ? (
        <div
          style={{
            padding: "5rem 0",
            textAlign: "center",
            borderBottom: "1px solid var(--border)" }}
        >
          <div
            style={{
              fontSize: "3rem",
              fontWeight: 600,

              color: "var(--border)",
              marginBottom: "0.5rem" }}
          >
            0 Lots
          </div>
          <p style={{ color: "var(--muted)", fontSize: "var(--font-base)" }}>
            No auctions match your filters.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
            gap: "1.5rem" }}
        >
          {auctions.map((a, i) => (
            <AuctionCard
              key={a.id}
              auction={a}
              index={i}
              isWatched={user ? watchedIds.has(a.id) : false}
              showWatchlist={!!user}
              isOwner={!!user && user.id === a.seller?.id}
              onToggleWatchlist={(e) => toggleWatchlist(e, a.id)}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {data && data.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            marginTop: "3rem",
            borderRight: "1px solid var(--border)",
            width: "fit-content" }}
        >
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                padding: "0.65rem 1.25rem",
                borderRight: "none",
                background: p === page ? "var(--text)" : "var(--surface)",
                color: p === page ? "var(--bg)" : "var(--text)",
                fontSize: "var(--font-sm)",
                fontWeight: 500,
                cursor: "pointer" }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Lot number helper ──
function lotNumber(i: number) {
  return String(i + 1).padStart(3, "0");
}

function AuctionCard({
  auction,
  index,
  isWatched,
  showWatchlist,
  isOwner,
  onToggleWatchlist }: {
  auction: Auction;
  index: number;
  isWatched: boolean;
  showWatchlist: boolean;
  isOwner: boolean;
  onToggleWatchlist: (e: React.MouseEvent) => void;
}) {
  const typeLabel: Record<string, string> = {
    ENGLISH: "English",
    DUTCH: "Dutch",
    SEALED_BID: "Sealed Bid" };
  const typeBadgeClass: Record<string, string> = {
    ENGLISH: "badge badge-english",
    DUTCH: "badge badge-dutch",
    SEALED_BID: "badge badge-sealed" };

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = new Date(auction.endTime).getTime() - now;
  const timeText = diff <= 0
    ? "Ended"
    : Math.floor(diff / 3600000) > 0
      ? `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`
      : `${Math.floor((diff % 3600000) / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
  const urgent = diff > 0 && diff < 3600000;

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="auction-card"
      style={{
        padding: isOwner ? "0" : "2rem",
        display: "block",
        background: "var(--surface)",
        position: "relative" }}
    >
      {/* Your Listing banner */}
      {isOwner && (
        <div
          style={{
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
            padding: "0.5rem 2rem",
            fontSize: "0.65rem",
            fontWeight: 500,


            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            gap: "0.35rem" }}
        >
          YOUR LISTING
        </div>
      )}
      <div style={{ padding: isOwner ? "2rem" : "0" }}>
      {/* Watchlist button */}
      {showWatchlist && (
        <button
          onClick={onToggleWatchlist}
          title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
          style={{
            position: "absolute",
            top: "1.5rem",
            right: "1.5rem",
            background: "var(--surface)",
            border: `1.5px solid ${isWatched ? "var(--text)" : "var(--border-hard)"}`,
            color: isWatched ? "var(--text)" : "var(--muted)",
            padding: "0.3rem 0.6rem",
            fontSize: "0.65rem",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.15s",
            zIndex: 2 }}
        >
          {isWatched ? "WATCHED" : "WATCH"}
        </button>
      )}

      {/* Lot number + type */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1rem",
          paddingRight: showWatchlist ? "2rem" : "0" }}
      >
        <span
          style={{
            fontSize: "var(--font-xs)",
            fontWeight: 700,
            color: "var(--muted)" }}
        >
          Lot {lotNumber(index)}
        </span>
        <span className={typeBadgeClass[auction.type]} style={{ fontSize: "0.6rem" }}>
          {typeLabel[auction.type]}
        </span>
        {auction.status === "ENDED" && (
          <span style={{
            fontSize: "0.6rem", 
            fontWeight: 500,
            padding: "0.15rem 0.4rem", 
            background: auction.winnerId ? "rgba(26,127,60,0.1)" : "rgba(100,100,100,0.1)", 
            color: auction.winnerId ? "var(--success)" : "var(--muted)", 
            border: `1px solid ${auction.winnerId ? "var(--success)" : "var(--muted)"}`,
            marginLeft: "0.5rem" }}>
            {auction.winnerId ? "Won" : "Unsold"}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        style={{
          fontWeight: 700,
          fontSize: "var(--font-base)",
          lineHeight: 1.35,
          marginBottom: "1.25rem",
          color: "var(--text)",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" }}
      >
        {auction.title}
      </h3>

      {/* Price & timer row */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: "0.85rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end" }}
      >
        <div>
          <div className="price-label" style={{ marginBottom: "0.2rem" }}>
            Current Bid
          </div>
          <div
            style={{
              fontSize: "1.4rem",
              fontWeight: 600,

              color: "var(--accent)",
              lineHeight: 1 }}
          >
            ₹{auction.currentPrice?.toLocaleString()}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            className="price-label"
            style={{
              marginBottom: "0.2rem",
              color: urgent ? "var(--accent)" : "var(--muted)" }}
          >
            Time Left
          </div>
          <div
            style={{
              fontSize: "0.9rem",
              fontWeight: 500,

              color: urgent ? "var(--accent)" : "var(--text)",
              fontVariantNumeric: "tabular-nums" }}
          >
            {timeText}
          </div>
        </div>
      </div>

      {/* Seller + bids */}
      <div
        style={{
          marginTop: "0.65rem",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "var(--font-xs)",
          color: "var(--muted)" }}
      >
        <span>by {auction.seller?.name}</span>
        <span>{auction._count?.bids ?? 0} bids</span>
      </div>
      </div>
    </Link>
  );
}

