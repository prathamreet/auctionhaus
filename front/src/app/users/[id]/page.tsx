"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  AuctionStatusBadge,
  Card,
  EmptyState,
  Money,
  PageHeader,
  PageShell,
  Skeleton,
  Stat,
  StatGrid,
} from "@/components/ui";

interface PublicProfile {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  rating: number;
  ratingCount: number;
  createdAt: string;
  _count: { auctions: number; bids: number };
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", id],
    queryFn: () =>
      api
        .get(`/users/${id}`)
        .then((r) => r.data as PublicProfile)
        .catch(() => null),
    enabled: !!id,
  });

  const { data: auctionsData } = useQuery({
    queryKey: ["user-auctions", id],
    queryFn: () =>
      api
        .get(`/auctions?sellerId=${id}&limit=10`)
        .then((r) => r.data.auctions ?? [])
        .catch(() => []),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader eyebrow="Public profile" title={<Skeleton width={220} height={32} />} />
        <Card padding="lg">
          <Skeleton width={140} height={14} />
          <div style={{ height: 14 }} />
          <Skeleton width="60%" height={14} />
        </Card>
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell>
        <EmptyState title="User not found" hint="The profile you’re looking for doesn’t exist." />
      </PageShell>
    );
  }

  const initials = profile.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const memberSince = new Date(profile.createdAt).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  const starRating = profile.ratingCount > 0 ? profile.rating.toFixed(1) : null;

  return (
    <PageShell>
      <PageHeader eyebrow="Public profile" title={profile.name} subtitle={`Member since ${memberSince}`} />

      <Card padding="lg" style={{ display: "flex", gap: "1.25rem", alignItems: "center", marginBottom: "1.5rem" }}>
        <div
          style={{
            width: 72,
            height: 72,
            background: "var(--text)",
            color: "var(--bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "1.5rem",
            borderRadius: 999,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ fontWeight: 700, fontSize: "var(--font-lg)" }}>{profile.name}</div>
          <div style={{ fontSize: "var(--font-sm)", color: "var(--muted)" }}>
            {starRating ? (
              <span style={{ color: "var(--warning)", fontWeight: 700 }}>
                ★ {starRating}
                <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 6 }}>
                  ({profile.ratingCount} review{profile.ratingCount !== 1 ? "s" : ""})
                </span>
              </span>
            ) : (
              <span>No ratings yet</span>
            )}
          </div>
        </div>
      </Card>

      <StatGrid minWidth={220}>
        <Stat label="Auctions listed" value={profile._count.auctions} color="var(--accent)" />
        <Stat label="Bids placed" value={profile._count.bids} />
        <Stat label="Rating" value={starRating ?? "—"} color="var(--warning)" />
      </StatGrid>

      <div style={{ marginTop: "2rem" }}>
        <div
          style={{
            fontSize: "var(--font-xs)",
            fontWeight: 700,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: "0.75rem",
          }}
        >
          Active listings
        </div>
        {!auctionsData || auctionsData.length === 0 ? (
          <EmptyState title="No active listings" />
        ) : (
          <Card padding="none">
            {auctionsData.map(
              (a: { id: string; title: string; status: string; currentPrice: number }, i: number) => (
                <Link
                  key={a.id}
                  href={`/auctions/${a.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 130px 110px",
                    padding: "0.85rem 1.25rem",
                    borderBottom:
                      i < auctionsData.length - 1 ? "1px solid var(--border)" : "none",
                    alignItems: "center",
                    gap: "1rem",
                    fontSize: "var(--font-sm)",
                    color: "var(--text)",
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                    }}
                  >
                    {a.title}
                  </span>
                  <Money
                    value={a.currentPrice}
                    color="var(--accent)"
                    size="sm"
                    style={{ textAlign: "right" }}
                  />
                  <span style={{ textAlign: "right" }}>
                    <AuctionStatusBadge status={a.status} />
                  </span>
                </Link>
              )
            )}
          </Card>
        )}
      </div>
    </PageShell>
  );
}
