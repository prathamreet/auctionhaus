"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";

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
      <div
        style={{
          padding: "4rem",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: "var(--font-sm)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        style={{
          padding: "4rem",
          textAlign: "center",
          color: "var(--muted)",
        }}
      >
        User not found.
      </div>
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
    <div style={{ maxWidth: "100%", margin: "0", padding: "4rem 4vw", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "4vw", alignItems: "start" }}>
      <div>
      {/* ── Profile Header ── */}
      <div
        style={{
          padding: "2.5rem 2rem",
          border: "1.5px solid var(--border-hard)",
          borderBottom: "none",
          background: "var(--surface)",
          display: "flex",
          gap: "1.5rem",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 72,
            height: 72,
            background: "var(--text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: "1.5rem",
            color: "#fff",
            flexShrink: 0,
            letterSpacing: "-0.02em",
          }}
        >
          {initials}
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: "0.25rem",
            }}
          >
            Public Profile
          </div>
          <h1
            style={{
              fontSize: "var(--font-2xl)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              marginBottom: "0.5rem",
            }}
          >
            {profile.name}
          </h1>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              alignItems: "center",
              fontSize: "var(--font-sm)",
              color: "var(--muted)",
            }}
          >
            {starRating && (
              <span
                style={{
                  color: "var(--warning)",
                  fontWeight: 800,
                  fontSize: "var(--font-sm)",
                }}
              >
                [RATE] {starRating}
                <span
                  style={{
                    color: "var(--muted)",
                    fontWeight: 400,
                    marginLeft: "0.3rem",
                  }}
                >
                  ({profile.ratingCount} review{profile.ratingCount !== 1 ? "s" : ""})
                </span>
              </span>
            )}
            <span>Member since {memberSince}</span>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          border: "1.5px solid var(--border-hard)",
          borderBottom: "none",
        }}
      >
        {[
          { label: "Auctions Listed", value: profile._count.auctions, color: "var(--accent)" },
          { label: "Total Bids Placed", value: profile._count.bids, color: "var(--text)" },
          {
            label: "Rating",
            value: starRating ? starRating : "—",
            color: "var(--warning)",
          },
        ].map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "1.5rem 2rem",
              borderRight: i < 2 ? "1.5px solid var(--border-hard)" : undefined,
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
                marginBottom: "0.5rem",
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                color: s.color,
                lineHeight: 1,
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
      </div>

      <div>
      {/* ── Active Listings ── */}
      <div style={{ border: "1.5px solid var(--border-hard)", background: "var(--surface)" }}>
        <div
          style={{
            padding: "0.85rem 2rem",
            background: "var(--surface-2)",
            borderBottom: "1.5px solid var(--border-hard)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: "var(--font-sm)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
            }}
          >
            Active Listings
          </span>
          <Link
            href={`/auctions?seller=${id}`}
            style={{
              fontSize: "var(--font-xs)",
              color: "var(--accent)",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            All listings →
          </Link>
        </div>

        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 120px 90px",
            padding: "0.85rem 2rem",
            background: "var(--surface-2)",
            borderBottom: "1.5px solid var(--border-hard)",
            fontSize: "var(--font-xs)",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          <span>Title</span>
          <span style={{ textAlign: "right" }}>Price</span>
          <span style={{ textAlign: "right" }}>Status</span>
        </div>

        {!auctionsData || auctionsData.length === 0 ? (
          <div
            style={{
              padding: "2.5rem 2rem",
              color: "var(--muted)",
              fontSize: "var(--font-sm)",
              background: "var(--surface)",
            }}
          >
            No active listings.
          </div>
        ) : (
          auctionsData.map(
            (a: {
              id: string;
              title: string;
              status: string;
              currentPrice: number;
            }) => (
              <Link
                key={a.id}
                href={`/auctions/${a.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 90px",
                  padding: "1rem 2rem",
                  borderBottom: "1.5px solid var(--border-hard)",
                  fontSize: "var(--font-base)",
                  background: "var(--surface)",
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
                  {a.title}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: "var(--accent)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ₹{a.currentPrice?.toLocaleString()}
                </span>
                <span
                  style={{
                    fontSize: "var(--font-xs)",
                    color:
                      a.status === "ACTIVE"
                        ? "var(--success)"
                        : "var(--muted)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    textAlign: "right",
                  }}
                >
                  {a.status}
                </span>
              </Link>
            )
          )
        )}
      </div>
      </div>
    </div>
  );
}
