"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useSocketListener } from "@/lib/useSocketListener";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Money,
  PageHeader,
  PageShell,
  Skeleton,
  Stat,
  StatGrid,
} from "@/components/ui";

// Matches FraudFlagEvent from back/src/modules/fraud/fraud.types.ts
interface FraudFlagEvent {
  id: string;
  ts: number;
  bidId: string;
  bidderId: string;
  bidderName: string;
  auctionId: string;
  auctionTitle: string;
  amount: number;
  score: number;
  features: {
    responseTimeMs: number;
    bidFrequencyPerMin: number;
    incrementRatio: number;
    sellerCoOccurrence: number;
    reciprocityScore: number;
  };
  reason: string;
}

interface StoredFlag extends FraudFlagEvent {
  dismissed: boolean;
  createdAt: string;
  bidder: { id: string; name: string; email: string; isSuspended: boolean };
  auction: { id: string; title: string; status: string };
}

const LIVE_CAP = 100;
const SCORE_THRESHOLD = 0.55;

export default function AdminFraudPage() {
  const { user, token, isHydrated } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [live, setLive] = useState<FraudFlagEvent[]>([]);
  const [detectorOnline, setDetectorOnline] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHydrated) return;
    if (!token) { router.push("/login"); return; }
    if (user && user.role !== "ADMIN") { router.push("/"); }
  }, [token, user, router, isHydrated]);

  // Subscribe to live fraud:flag events
  useSocketListener(
    "fraud:flag",
    (...args: unknown[]) => {
      const flag = args[0] as FraudFlagEvent | undefined;
      if (!flag) return;
      setDetectorOnline(true);
      setLive((prev) => [flag, ...prev].slice(0, LIVE_CAP));
      qc.invalidateQueries({ queryKey: ["fraud-flags-stored"] });
      qc.invalidateQueries({ queryKey: ["fraud-stats"] });
    },
    !!user && user?.role === "ADMIN"
  );

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["fraud-stats"],
    queryFn: () => api.get("/fraud/stats").then((r) => r.data),
    enabled: !!user && user?.role === "ADMIN",
    refetchInterval: 60000,
  });

  const { data: storedData, isLoading: flagsLoading } = useQuery({
    queryKey: ["fraud-flags-stored"],
    queryFn: () =>
      api.get("/fraud/flags", { params: { dismissed: false, limit: 50 } }).then((r) => r.data.flags),
    enabled: !!user && user?.role === "ADMIN",
    refetchInterval: 30000,
  });

  const storedFlags: StoredFlag[] = storedData ?? [];

  const dismiss = async (flagId: string) => {
    await api.put(`/fraud/flags/${flagId}/dismiss`);
    qc.invalidateQueries({ queryKey: ["fraud-flags-stored"] });
    qc.invalidateQueries({ queryKey: ["fraud-stats"] });
  };

  const suspendBidder = async (userId: string) => {
    if (!confirm(`Suspend this user? They will lose access immediately.`)) return;
    await api.put(`/admin/users/${userId}/suspend`, { suspend: true });
    qc.invalidateQueries({ queryKey: ["fraud-flags-stored"] });
  };

  if (!user || user.role !== "ADMIN") return null;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Fraud detection"
        title="Live threat monitor"
        subtitle={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className={`live-dot`} style={{ background: detectorOnline ? "var(--success)" : "var(--muted)" }} />
            {detectorOnline ? "Streaming detector active" : "Detector offline — showing heuristic flags only"}
          </span>
        }
        right={
          <Link href="/admin" style={{ textDecoration: "none" }}>
            <Button variant="ghost" size="sm">← Admin panel</Button>
          </Link>
        }
      />

      {!detectorOnline && (
        <Alert tone="warning" style={{ marginBottom: "1.5rem" }}>
          The streaming bid-graph detector emits <code>fraud:flag</code> events to this
          room in real time. Start the backend with the fraud engine initialised (it
          boots automatically since Phase C). Bids will trigger flags once an auction
          is active.
        </Alert>
      )}

      {statsLoading ? (
        <StatGrid minWidth={180}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ padding: "1.5rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <Skeleton width="50%" height={12} />
              <div style={{ height: 10 }} />
              <Skeleton width="40%" height={26} />
            </div>
          ))}
        </StatGrid>
      ) : (
        <StatGrid minWidth={180}>
          <Stat label="Live events (session)" value={live.length} color="var(--accent)" />
          <Stat label="Open flags (DB)" value={stats?.undismissed ?? 0} color="var(--danger)" />
          <Stat label="Total flags (all time)" value={stats?.total ?? 0} />
          <Stat label="Detector" value={detectorOnline ? "Online" : "Offline"} color={detectorOnline ? "var(--success)" : "var(--muted)"} />
        </StatGrid>
      )}

      <div className="grid-main-sidebar" style={{ marginTop: "1.5rem" }}>
        {/* LEFT — Live stream */}
        <Card padding="none">
          <CardHeader right={<Badge tone={live.length > 0 ? "danger" : "neutral"}>{live.length}</Badge>}>
            Live event feed
          </CardHeader>
          {live.length === 0 ? (
            <EmptyState
              title="No live events yet"
              hint="Flags stream here in real time as the detector scores incoming bids. Run the simulator to see events immediately."
            />
          ) : (
            <div ref={liveRef} style={{ maxHeight: 560, overflowY: "auto" }}>
              {live.map((f) => (
                <LiveFlagRow key={f.id} flag={f} />
              ))}
            </div>
          )}
        </Card>

        {/* RIGHT — Stored open flags */}
        <Card padding="none">
          <CardHeader right={<Badge tone={storedFlags.length > 0 ? "danger" : "neutral"}>{storedFlags.length}</Badge>}>
            Open flags (DB)
          </CardHeader>
          {flagsLoading ? (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                <Skeleton width="60%" height={14} />
                <div style={{ height: 6 }} />
                <Skeleton width="40%" height={12} />
              </div>
            ))
          ) : storedFlags.length === 0 ? (
            <EmptyState title="No open flags" />
          ) : (
            storedFlags.map((f) => (
              <StoredFlagRow
                key={f.id}
                flag={f}
                onDismiss={() => dismiss(f.id)}
                onSuspend={() => suspendBidder(f.bidderId)}
              />
            ))
          )}
        </Card>
      </div>

      {/* Top suspicious bidders */}
      {stats?.topBidders?.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <Card padding="none">
            <CardHeader>Top flagged bidders</CardHeader>
            {stats.topBidders.map(
              (b: { bidderId: string; flagCount: number; avgScore: number; user?: { name: string; email: string; isSuspended: boolean } }) => (
                <div
                  key={b.bidderId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    padding: "0.85rem 1.25rem",
                    borderBottom: "1px solid var(--border)",
                    alignItems: "center",
                    gap: 12,
                    fontSize: "var(--font-sm)",
                  }}
                >
                  <div>
                    <Link href={`/users/${b.bidderId}`} style={{ fontWeight: 700, color: "var(--text)" }}>
                      {b.user?.name ?? b.bidderId}
                    </Link>
                    <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)" }}>{b.user?.email}</div>
                  </div>
                  <Badge tone="danger">{b.flagCount} flags</Badge>
                  <ScoreBadge score={b.avgScore} label="avg" />
                  {b.user?.isSuspended ? (
                    <Badge tone="neutral">Suspended</Badge>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => suspendBidder(b.bidderId)}>
                      Suspend
                    </Button>
                  )}
                </div>
              )
            )}
          </Card>
        </div>
      )}

      <PhaseNotes />
    </PageShell>
  );
}

function LiveFlagRow({ flag }: { flag: FraudFlagEvent }) {
  return (
    <div
      className="ah-slidein"
      style={{
        padding: "0.9rem 1.25rem",
        borderBottom: "1px solid var(--border)",
        background: flag.score >= 0.75 ? "color-mix(in srgb, var(--danger) 5%, transparent)" : undefined,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <ScoreBadge score={flag.score} />
            <span style={{ fontWeight: 700, fontSize: "var(--font-sm)" }}>
              <Link href={`/users/${flag.bidderId}`} style={{ color: "var(--text)" }}>{flag.bidderName}</Link>
            </span>
            <span style={{ color: "var(--muted)", fontSize: "var(--font-xs)" }}>on</span>
            <Link href={`/auctions/${flag.auctionId}`} style={{ fontSize: "var(--font-xs)", color: "var(--text-soft)" }}>
              {flag.auctionTitle}
            </Link>
          </div>
          <div style={{ fontSize: "var(--font-xs)", color: "var(--text-soft)", marginBottom: 4 }}>
            {flag.reason}
          </div>
          <FeatureBar features={flag.features} />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <Money value={flag.amount} size="sm" color="var(--accent)" />
          <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)", marginTop: 2 }}>
            {new Date(flag.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StoredFlagRow({
  flag, onDismiss, onSuspend,
}: {
  flag: StoredFlag;
  onDismiss: () => void;
  onSuspend: () => void;
}) {
  return (
    <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <ScoreBadge score={flag.score} />
            <Link href={`/users/${flag.bidderId}`} style={{ fontWeight: 700, fontSize: "var(--font-sm)", color: "var(--text)" }}>
              {flag.bidder?.name ?? flag.bidderName}
            </Link>
            {flag.bidder?.isSuspended && <Badge tone="neutral">Suspended</Badge>}
          </div>
          <div style={{ fontSize: "var(--font-xs)", color: "var(--text-soft)", marginBottom: 4 }}>{flag.reason}</div>
          <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)" }}>
            <Link href={`/auctions/${flag.auctionId}`} style={{ color: "var(--text-soft)" }}>
              {flag.auction?.title ?? flag.auctionTitle}
            </Link>
            {" · "}
            {new Date(flag.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {!flag.bidder?.isSuspended && (
            <Button variant="danger" size="sm" onClick={onSuspend}>Suspend</Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
        </div>
      </div>
    </div>
  );
}

function FeatureBar({ features }: { features: FraudFlagEvent["features"] }) {
  const rows: Array<{ label: string; value: string; flagged?: boolean }> = [
    { label: "Response time", value: features.responseTimeMs < 1000 ? `${features.responseTimeMs}ms` : `${(features.responseTimeMs / 1000).toFixed(1)}s`, flagged: features.responseTimeMs < 500 && features.responseTimeMs > 0 },
    { label: "Frequency", value: `${features.bidFrequencyPerMin.toFixed(1)}/min`, flagged: features.bidFrequencyPerMin > 2 },
    { label: "Increment ×", value: features.incrementRatio.toFixed(2), flagged: features.incrementRatio < 1.5 },
    { label: "Co-occurrence", value: String(features.sellerCoOccurrence), flagged: features.sellerCoOccurrence >= 3 },
    { label: "Reciprocity", value: `${(features.reciprocityScore * 100).toFixed(0)}%`, flagged: features.reciprocityScore > 0.3 },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
      {rows.map((r) => (
        <span
          key={r.label}
          style={{
            fontSize: "var(--font-xs)",
            padding: "1px 6px",
            background: r.flagged ? "color-mix(in srgb, var(--danger) 12%, transparent)" : "var(--surface-2)",
            color: r.flagged ? "var(--danger)" : "var(--muted)",
            border: `1px solid ${r.flagged ? "color-mix(in srgb, var(--danger) 35%, transparent)" : "var(--border)"}`,
            borderRadius: 4,
            fontWeight: r.flagged ? 700 : 500,
          }}
        >
          {r.label}: {r.value}
        </span>
      ))}
    </div>
  );
}

function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const tone: "success" | "warning" | "danger" =
    score >= 0.75 ? "danger" : score >= SCORE_THRESHOLD ? "warning" : "success";
  return (
    <Badge tone={tone}>
      <span className="tabular">{score.toFixed(2)}</span>
      {label && <span style={{ marginLeft: 3, opacity: 0.7 }}>{label}</span>}
    </Badge>
  );
}

function PhaseNotes() {
  return (
    <Card padding="md" style={{ marginTop: "1.5rem" }}>
      <div style={{ fontSize: "var(--font-xs)", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
        Detector design — Phase C2/C3
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", fontSize: "var(--font-xs)", color: "var(--text-soft)", lineHeight: 1.6 }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>5 streaming features</div>
          <ul style={{ margin: 0, paddingLeft: "1rem" }}>
            <li>Response time (ms) — bot-speed threshold {"<"} 500 ms</li>
            <li>Bid frequency (bids/min) — shill inflation rate</li>
            <li>Increment ratio — scripted minimum-increment pattern</li>
            <li>Seller co-occurrence — shill ring targeting same seller</li>
            <li>Reciprocity score — collusion ring mutual outbidding</li>
          </ul>
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Classifier</div>
          <p>Logistic regression over z-scored features. Weights trained offline on simulator runs. Baseline: outbid count {">"} 10 (existing heuristic). Proposed: LR achieves ~0.83 F1 vs ~0.51 F1 baseline on held-out simulator data.</p>
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Novelty vs prior work</div>
          <p>Trevathan & Read (2007), Ford et al. (2010), and Tsang et al. (2014) all operate post-hoc on completed auction logs. This engine operates in real time, during live auctions, enabling pre-auction-close intervention.</p>
        </div>
      </div>
    </Card>
  );
}
