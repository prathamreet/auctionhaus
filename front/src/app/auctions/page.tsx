"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useSocketListener } from "@/lib/useSocketListener";
import {
  AuctionTypeBadge,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Money,
  PageHeader,
  PageShell,
  Select,
  SkeletonGrid,
  Toolbar,
  formatRemaining,
} from "@/components/ui";

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

  useSocketListener("auction:state-sync", () => {
    qc.refetchQueries({ queryKey: ["auctions"] });
  });

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
            limit: 12,
          },
        })
        .then((r) => r.data),
  });

  const { data: watchlistData } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () =>
      api
        .get("/watchlist")
        .then((r) => r.data.watchlist ?? [])
        .catch(() => []),
    enabled: !!user,
  });

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
    <PageShell>
      <PageHeader
        eyebrow={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span className="live-dot" /> Live catalogue
          </span>
        }
        title="Auction catalogue"
        right={
          user ? (
            <Link href="/auctions/create" style={{ textDecoration: "none" }}>
              <Button size="md">+ New listing</Button>
            </Link>
          ) : null
        }
      />

      <Toolbar>
        <Input
          placeholder="Search auctions..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ maxWidth: 320 }}
        />
        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          style={{ maxWidth: 160 }}
        >
          <option value="">All types</option>
          <option value="ENGLISH">English</option>
          <option value="DUTCH">Dutch</option>
          <option value="SEALED_BID">Sealed bid</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{ maxWidth: 160 }}
        >
          <option value="ACTIVE">Active</option>
          <option value="ENDED">Ended</option>
          <option value="ALL">All status</option>
        </Select>
        <div
          style={{
            marginLeft: "auto",
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            fontWeight: 600,
          }}
        >
          {isLoading
            ? "Loading…"
            : `${auctions.length} lot${auctions.length !== 1 ? "s" : ""}`}
        </div>
      </Toolbar>

      {isLoading ? (
        <SkeletonGrid count={6} minWidth={320} />
      ) : auctions.length === 0 ? (
        <EmptyState
          title="No auctions match these filters"
          hint="Try changing the type, status, or clearing the search."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1.25rem",
          }}
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

      {data && data.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            marginTop: "2.5rem",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === page ? "primary" : "ghost"}
              onClick={() => setPage(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function AuctionCard({
  auction,
  index,
  isWatched,
  showWatchlist,
  isOwner,
  onToggleWatchlist,
}: {
  auction: Auction;
  index: number;
  isWatched: boolean;
  showWatchlist: boolean;
  isOwner: boolean;
  onToggleWatchlist: (e: React.MouseEvent) => void;
}) {
  const diff = new Date(auction.endTime).getTime() - Date.now();
  const urgent = diff > 0 && diff < 3600000;
  const ended = auction.status === "ENDED";

  return (
    <Link
      href={`/auctions/${auction.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <Card padding="none" style={{ overflow: "hidden", position: "relative" }}>
        {isOwner && (
          <div
            style={{
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              padding: "0.4rem 1.25rem",
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Your listing
          </div>
        )}
        <div style={{ padding: "1.5rem" }}>
          {showWatchlist && (
            <button
              onClick={onToggleWatchlist}
              title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
              style={{
                position: "absolute",
                top: "1.1rem",
                right: "1.1rem",
                background: isWatched
                  ? "var(--text)"
                  : "var(--surface)",
                color: isWatched ? "var(--bg)" : "var(--text-soft)",
                border: `1px solid ${isWatched ? "var(--text)" : "var(--border-hard)"}`,
                padding: "0.25rem 0.55rem",
                fontSize: "var(--font-xs)",
                fontWeight: 700,
                borderRadius: 999,
                letterSpacing: "0.04em",
              }}
            >
              {isWatched ? "Watching" : "Watch"}
            </button>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              marginBottom: "0.85rem",
              paddingRight: showWatchlist ? 80 : 0,
            }}
          >
            <span
              style={{
                fontSize: "var(--font-xs)",
                fontWeight: 700,
                color: "var(--muted)",
                letterSpacing: "0.04em",
              }}
            >
              Lot {String(index + 1).padStart(3, "0")}
            </span>
            <AuctionTypeBadge type={auction.type} />
            {ended && (
              <Badge tone={auction.winnerId ? "success" : "neutral"}>
                {auction.winnerId ? "Won" : "Unsold"}
              </Badge>
            )}
          </div>

          <h3
            style={{
              fontWeight: 700,
              fontSize: "var(--font-md)",
              lineHeight: 1.3,
              marginBottom: "1.25rem",
              color: "var(--text)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "2.6em",
            }}
          >
            {auction.title}
          </h3>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "0.85rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                {ended ? "Final price" : "Current bid"}
              </div>
              <Money
                value={auction.currentPrice}
                size="md"
                color={ended ? "var(--text)" : "var(--accent)"}
              />
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  color: urgent ? "var(--danger)" : "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                {ended ? "Ended" : "Time left"}
              </div>
              {ended ? (
                <span style={{ fontWeight: 600, fontSize: "var(--font-sm)", color: "var(--muted)" }}>
                  {new Date(auction.endTime).toLocaleDateString([], { dateStyle: "medium" })}
                </span>
              ) : (
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "var(--font-sm)",
                    color: urgent ? "var(--danger)" : "var(--text)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatRemaining(diff)}
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: "0.65rem",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
            }}
          >
            <span>by {auction.seller?.name}</span>
            <span>{auction._count?.bids ?? 0} bids</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

