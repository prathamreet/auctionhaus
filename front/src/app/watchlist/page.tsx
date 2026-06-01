"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  AuctionStatusBadge,
  AuctionTypeBadge,
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  PageShell,
  SkeletonRow,
} from "@/components/ui";

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
    refetchInterval: 60000,
  });

  const remove = async (item: WatchItem) => {
    const auctionId = item.auctionId ?? item.auction?.id;
    if (!auctionId) return;
    await api.delete(`/watchlist/${auctionId}`).catch(() => null);
    qc.invalidateQueries({ queryKey: ["watchlist"] });
  };

  const items: WatchItem[] = data ?? [];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Account"
        title="Watchlist"
        subtitle={
          items.length > 0
            ? `${items.length} auction${items.length === 1 ? "" : "s"}`
            : undefined
        }
        right={
          <Link href="/auctions" style={{ textDecoration: "none" }}>
            <Button size="sm">Browse auctions →</Button>
          </Link>
        }
      />

      {isLoading ? (
        <Card padding="none">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonRow key={i} cols={4} />
          ))}
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          title="Watchlist is empty"
          hint="Tap the watch action on any auction in the catalogue to track it here."
        />
      ) : (
        <Card padding="none">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 130px 110px 110px 100px",
              padding: "0.6rem 1.5rem",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <span>Auction</span>
            <span style={{ textAlign: "right" }}>Current bid</span>
            <span style={{ textAlign: "center" }}>Status</span>
            <span style={{ textAlign: "right" }}>Ends</span>
            <span />
          </div>
          {items.map((item, i) => {
            const a = item.auction;
            const end = a?.endTime ? new Date(a.endTime) : null;
            return (
              <div
                key={item.id ?? item.auctionId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 130px 110px 110px 100px",
                  alignItems: "center",
                  padding: "1rem 1.5rem",
                  borderBottom:
                    i < items.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  gap: "0.5rem",
                }}
              >
                <div style={{ minWidth: 0 }}>
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
                      marginBottom: "0.25rem",
                    }}
                  >
                    {a?.title ?? "—"}
                  </Link>
                  {a?.type && <AuctionTypeBadge type={a.type} />}
                </div>
                <Money
                  value={a?.currentPrice ?? null}
                  size="sm"
                  color="var(--accent)"
                  style={{ textAlign: "right" }}
                />
                <div style={{ textAlign: "center" }}>
                  {a?.status && <AuctionStatusBadge status={a.status} />}
                </div>
                <div
                  style={{
                    fontSize: "var(--font-xs)",
                    color: "var(--muted)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {end
                    ? end.toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </div>
                <div style={{ textAlign: "right" }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(item)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </PageShell>
  );
}
