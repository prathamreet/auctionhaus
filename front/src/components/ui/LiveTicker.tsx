"use client";
import * as React from "react";

/**
 * Phase F1 — Live bid event ticker.
 *
 * Top-right slide-in toast stack for real-time auction events. Each toast
 * auto-dismisses after `dismissAfterMs` (default 4 s); hovering the toast
 * pauses the timer. The stack is capped at `max` simultaneous toasts to
 * prevent screen flooding under a busy auction.
 *
 * The component is controlled: callers (the auction detail page) push events
 * via the `useLiveTicker` hook, which exposes `push` and `clear`. Wiring is
 * inside the page; this file just renders.
 *
 * Production rationale: Without a ticker, the only signal that another user
 * just placed a bid is the bid history table refreshing. That's quiet --
 * users miss it, especially when scrolled away from the table or focused on
 * the bid input. A non-blocking corner toast respects focus and gives every
 * bid event a visible heartbeat.
 *
 * The kinds are:
 *   manual   — another user placed a manual bid
 *   ladder   — auto-bid ladder resolved (N rungs)
 *   outbid   — viewer's own previous bid just got outbid
 *   extended — anti-snipe extension fired
 *   backpressure — admin-only, stream saturated warning
 */
export type LiveTickerKind = "manual" | "ladder" | "outbid" | "extended" | "backpressure";

export interface LiveTickerEvent {
  id: string;
  kind: LiveTickerKind;
  title: string;
  detail?: string;
  /** Server timestamp (E10). Used for accurate "Xs ago" rendering. */
  serverTs?: number;
}

interface InternalEvent extends LiveTickerEvent {
  receivedAt: number;
  closing: boolean;
}

const KIND_STYLE: Record<
  LiveTickerKind,
  { accent: string; icon: string; label: string }
> = {
  manual: { accent: "var(--accent)", icon: "▲", label: "New bid" },
  ladder: { accent: "var(--accent-dark)", icon: "⇈", label: "Auto-bid ladder" },
  outbid: { accent: "var(--danger)", icon: "✕", label: "You were outbid" },
  extended: { accent: "var(--warning)", icon: "⏱", label: "Auction extended" },
  backpressure: { accent: "var(--warning)", icon: "≋", label: "High traffic" },
};

interface ContextValue {
  push: (e: LiveTickerEvent) => void;
  clear: () => void;
}

const LiveTickerContext = React.createContext<ContextValue | null>(null);

export function LiveTickerProvider({
  children,
  max = 5,
  dismissAfterMs = 4000,
}: {
  children: React.ReactNode;
  max?: number;
  dismissAfterMs?: number;
}) {
  const [events, setEvents] = React.useState<InternalEvent[]>([]);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const hoveredRef = React.useRef<string | null>(null);
  // Keep the ref in sync with the hovered state from an effect (not in render).
  // The ref is only read inside the auto-dismiss interval callback below, which
  // runs after commit, so an effect-time write is always current there.
  React.useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  const push = React.useCallback(
    (e: LiveTickerEvent) => {
      setEvents((prev) => {
        const next: InternalEvent = {
          ...e,
          receivedAt: Date.now(),
          closing: false,
        };
        const combined = [next, ...prev];
        // Cap stack — drop oldest beyond `max`.
        return combined.slice(0, max);
      });
    },
    [max],
  );

  const clear = React.useCallback(() => setEvents([]), []);

  // Auto-dismiss timer. Each tick walks the events list, closes any older than
  // `dismissAfterMs` (except the currently-hovered one), and removes events
  // that finished their close animation. Single global interval keeps DOM
  // listeners predictable.
  React.useEffect(() => {
    if (events.length === 0) return;
    const tick = setInterval(() => {
      setEvents((prev) => {
        const now = Date.now();
        const updated = prev.flatMap<InternalEvent>((ev) => {
          // Currently hovered events live forever until pointer leaves.
          if (ev.id === hoveredRef.current) return [ev];
          const age = now - ev.receivedAt;
          if (!ev.closing && age >= dismissAfterMs) {
            return [{ ...ev, closing: true, receivedAt: now }];
          }
          if (ev.closing && age >= 220) {
            // 220ms covers the ah-toast-out keyframes duration.
            return [];
          }
          return [ev];
        });
        return updated;
      });
    }, 200);
    return () => clearInterval(tick);
  }, [events.length, dismissAfterMs]);

  const ctx = React.useMemo<ContextValue>(() => ({ push, clear }), [push, clear]);

  return (
    <LiveTickerContext.Provider value={ctx}>
      {children}
      {events.length > 0 && (
        <div
          aria-live="polite"
          aria-label="Live auction events"
          style={{
            position: "fixed",
            top: "calc(var(--navbar-h) + 0.75rem)",
            right: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.45rem",
            zIndex: 90,
            pointerEvents: "none",
            maxWidth: "min(360px, calc(100vw - 1.5rem))",
          }}
        >
          {events.map((ev) => (
            <Toast
              key={ev.id}
              event={ev}
              onMouseEnter={() => setHovered(ev.id)}
              onMouseLeave={() => {
                setHovered((cur) => (cur === ev.id ? null : cur));
                // Reset receivedAt so the dismiss timer restarts after hover.
                setEvents((prev) =>
                  prev.map((e) =>
                    e.id === ev.id ? { ...e, receivedAt: Date.now() } : e,
                  ),
                );
              }}
            />
          ))}
        </div>
      )}
    </LiveTickerContext.Provider>
  );
}

function Toast({
  event,
  onMouseEnter,
  onMouseLeave,
}: {
  event: InternalEvent;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const style = KIND_STYLE[event.kind];
  return (
    <div
      className={event.closing ? "ah-toast-out" : "ah-toast-in"}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background: "var(--surface)",
        border: `1px solid ${style.accent}`,
        borderLeft: `4px solid ${style.accent}`,
        borderRadius: "var(--radius)",
        padding: "0.65rem 0.85rem",
        display: "flex",
        gap: "0.6rem",
        alignItems: "flex-start",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.10)",
        pointerEvents: "auto",
      }}
    >
      <span
        aria-hidden
        style={{
          color: style.accent,
          fontWeight: 800,
          fontSize: "var(--font-md)",
          lineHeight: 1,
          marginTop: 1,
        }}
      >
        {style.icon}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: "var(--font-xs)",
            fontWeight: 700,
            color: style.accent,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            lineHeight: 1.15,
          }}
        >
          {style.label}
        </div>
        <div
          style={{
            fontSize: "var(--font-sm)",
            color: "var(--text)",
            fontWeight: 600,
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={event.title}
        >
          {event.title}
        </div>
        {event.detail && (
          <div
            style={{
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
              marginTop: 2,
            }}
          >
            {event.detail}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Push events from any descendant component. Returns a stable `push` fn.
 * `clear()` empties the stack (useful on auction:ended).
 */
export function useLiveTicker(): ContextValue {
  const ctx = React.useContext(LiveTickerContext);
  if (!ctx) {
    // Safe no-op for components rendered outside a provider (e.g. SSR
    // snapshots, error boundaries).
    return { push: () => {}, clear: () => {} };
  }
  return ctx;
}
