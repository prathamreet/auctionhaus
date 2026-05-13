"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface WatchItem {
  id: string;
  auctionId: string;
  auction: {
    id: string;
    title: string;
    status: string;
    currentPrice: number;
    endTime: string;
    type: string;
    _count?: { bids: number };
  };
}

const TYPE_BADGE: Record<string, string> = {
  ENGLISH: "badge badge-english",
  DUTCH: "badge badge-dutch",
  SEALED_BID: "badge badge-sealed" };

const TYPE_LABEL: Record<string, string> = {
  ENGLISH: "English",
  DUTCH: "Dutch",
  SEALED_BID: "Sealed Bid" };

export default function WatchlistPage() {
  const { user, token } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () =>
      api
        .get("/watchlist")
        .then((r) => r.data.watchlist ?? [])
        .catch(() => []),
    enabled: !!user,
    refetchInterval: 60000, // 60s — list only changes when user adds/removes items
  });

  const remove = async (item: WatchItem) => {
    // Use auctionId field; fall back to item.auction.id from the relation
    const auctionId = item.auctionId ?? item.auction?.id;
    if (!auctionId) return;
    await api.delete(`/watchlist/${auctionId}`).catch(() => null);
    qc.invalidateQueries({ queryKey: ["watchlist"] });
  };

  const items: WatchItem[] = data ?? [];

  return (
    <div style={{ maxWidth: "100%", margin: "0", padding: "4rem 4vw" }}>
      {/* ── Header ── */}
      <div
        style={{
          padding: "2.5rem 2rem",
          border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
          borderBottom: "none",
          background: "var(--surface)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1.5rem" }}
      >
        <div>
          <div
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 700,


              color: "var(--muted)",
              marginBottom: "0.3rem" }}
          >
            Your account
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1
              style={{
                fontSize: "var(--font-2xl)",
                fontWeight: 600,

                lineHeight: 1 }}
            >
              Watchlist
            </h1>
            {items.length > 0 && (
              <span
                style={{
                  background: "var(--text)",
                  color: "var(--bg)",
                  fontSize: "var(--font-xs)",
                  fontWeight: 600,
                  padding: "0.3rem 0.65rem" }}
              >
                {items.length}
              </span>
            )}
          </div>
        </div>

        <Link
          href="/auctions"
          style={{
            background: "var(--accent)",
            color: "#fff",
            padding: "0.5rem 1.25rem",
            fontWeight: 700,
            fontSize: "var(--font-xs)" }}
        >
          Browse Auctions →
        </Link>
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div
          style={{
            padding: "4rem",
            textAlign: "center",
            color: "var(--muted)",
            fontSize: "var(--font-sm)" }}
        >
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: "5rem 2rem", textAlign: "center", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", background: "var(--surface)" }}>
          <div
            style={{
              fontSize: "var(--font-sm)",
              fontWeight: 500,


              marginBottom: "0.4rem" }}
          >
            [EMPTY] Watchlist is empty
          </div>
          <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)" }}>
            Add auctions from the catalogue to track them here.
          </div>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" }}>
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 100px 90px 100px",
              padding: "0.85rem 1.5rem",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              fontSize: "var(--font-xs)",
              fontWeight: 500,


              color: "var(--muted)" }}
          >
            <span>Auction</span>
            <span style={{ textAlign: "right" }}>Current Bid</span>
            <span style={{ textAlign: "center" }}>Status</span>
            <span style={{ textAlign: "right" }}>Ends</span>
            <span />
          </div>

          {items.map((item, i) => {
            const a = item.auction;
            const isEnded = a?.status === "ENDED" || a?.status === "CANCELLED";
            const endDate = a?.endTime ? new Date(a.endTime) : null;
            const endLabel = endDate
              ? endDate.toLocaleDateString([], { month: "short", day: "numeric" })
              : "—";

            return (
              <div
                key={item.id ?? item.auctionId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 100px 90px 100px",
                  alignItems: "center",
                  padding: "1.25rem 1.5rem",
                  borderBottom: i < items.length - 1 ? "1.5px solid var(--border-hard)" : "none",
                  background: "var(--surface)",
                  transition: "background 0.1s",
                  gap: "0.5rem" }}
              >
                {/* Title + type */}
                <div style={{ overflow: "hidden" }}>
                  <Link
                    href={`/auctions/${a?.id}`}
                    style={{
                      fontWeight: 600,
                      fontSize: "var(--font-sm)",
                      color: "var(--text)",
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginBottom: "0.2rem" }}
                  >
                    {a?.title ?? "—"}
                  </Link>
                  {a?.type && (
                    <span
                      className={TYPE_BADGE[a.type]}
                      style={{ fontSize: "0.55rem" }}
                    >
                      {TYPE_LABEL[a.type]}
                    </span>
                  )}
                </div>

                {/* Current price */}
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: "var(--font-sm)",
                    color: "var(--accent)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums" }}
                >
                  ₹{a?.currentPrice?.toLocaleString() ?? "—"}
                </div>

                {/* Status */}
                <div style={{ textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: "var(--font-xs)",
                      fontWeight: 700,


                      color: isEnded ? "var(--muted)" : "var(--success)" }}
                  >
                    {a?.status ?? "—"}
                  </span>
                </div>

                {/* End date */}
                <div
                  style={{
                    fontSize: "var(--font-xs)",
                    color: "var(--muted)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums" }}
                >
                  {endLabel}
                </div>

                {/* Remove */}
                <div style={{ textAlign: "right" }}>
                  <button
                    onClick={() => remove(item)}
                    style={{
                      background: "none",
                      border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                      color: "var(--text)",
                      padding: "0.5rem 0.75rem",
                      fontSize: "var(--font-xs)",
                      cursor: "pointer",
                      fontWeight: 500,


                      transition: "all 0.12s" }}
                  >
                    REMOVE
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
