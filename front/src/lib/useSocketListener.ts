"use client";
import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";

type Listener = (...args: unknown[]) => void;

/**
 * Phase F2: tri-state connection indicator for the Navbar.
 *
 * socket.io-client surfaces four manager events we care about:
 *   - connect            -> "connected"
 *   - disconnect         -> "offline"
 *   - reconnect_attempt  -> "reconnecting"
 *   - reconnect          -> "connected"  (followed by `connect`)
 *
 * The hook reads the socket's current state on mount so subscribers that
 * mount AFTER the initial connection don't flash "offline" before the next
 * event arrives. Returns "connected" | "reconnecting" | "offline".
 */
export type ConnectionState = "connected" | "reconnecting" | "offline";

export function useConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(() => {
    if (typeof window === "undefined") return "connected"; // SSR — assume OK
    const s = getSocket();
    return s.connected ? "connected" : "reconnecting";
  });

  useEffect(() => {
    const sock = getSocket();
    const onConnect = () => setState("connected");
    const onDisconnect = () => setState("offline");
    const onReconnectAttempt = () => setState("reconnecting");
    const onReconnect = () => setState("connected");

    sock.on("connect", onConnect);
    sock.on("disconnect", onDisconnect);
    sock.io.on("reconnect_attempt", onReconnectAttempt);
    sock.io.on("reconnect", onReconnect);

    // The lazy useState initializer already captured the connection state at
    // mount; the four listeners above carry every transition afterwards. No
    // synchronous re-sync is needed here.

    return () => {
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
      sock.io.off("reconnect_attempt", onReconnectAttempt);
      sock.io.off("reconnect", onReconnect);
    };
  }, []);

  return state;
}

/**
 * Subscribe to a single socket event for the lifetime of the component.
 * `handler` may change each render — the hook always calls the latest version
 * without re-subscribing (stored in a ref).
 *
 * Phase E9: `onReconnect` is an optional callback fired after the socket.io
 * Manager re-establishes a dropped connection. Pages that subscribe should
 * pass a `refetch` so any TanStack Query state that drifted during the
 * outage is re-synced. The callback is also ref-stable, so passing an
 * inline arrow function doesn't re-subscribe.
 */
export function useSocketListener(
  event: string,
  handler: Listener,
  enabled: boolean = true,
  onReconnect?: () => void
) {
  const handlerRef = useRef(handler);
  const reconnectRef = useRef(onReconnect);
  // Keep the latest handler/onReconnect in refs without re-subscribing.
  // Writing a ref during render is disallowed (react-hooks/refs); an unkeyed
  // effect runs after every commit, and the refs are only read inside socket
  // callbacks (which fire post-commit), so the values are always current.
  useEffect(() => {
    handlerRef.current = handler;
    reconnectRef.current = onReconnect;
  });

  useEffect(() => {
    if (!enabled) return;
    const sock = getSocket();
    const stable: Listener = (...args) => handlerRef.current(...args);
    sock.on(event, stable);

    const onR = () => reconnectRef.current?.();
    sock.io.on("reconnect", onR);

    return () => {
      sock.off(event, stable);
      sock.io.off("reconnect", onR);
    };
    // Re-run only when event or enabled changes, not handler / onReconnect
    // (both are held in refs above).
  }, [event, enabled]);
}

/**
 * Subscribe to multiple events at once.
 * `listeners` object identity may change — each listener is wrapped in a ref
 * so the actual socket subscription is stable.
 */
export function useSocketListeners(
  listeners: Record<string, Listener>,
  enabled: boolean = true,
  onReconnect?: () => void
) {
  const listenersRef = useRef(listeners);
  const reconnectRef = useRef(onReconnect);
  // Sync the latest listeners/onReconnect into refs from an effect (writing a
  // ref during render is disallowed). Reads happen only in socket callbacks.
  useEffect(() => {
    listenersRef.current = listeners;
    reconnectRef.current = onReconnect;
  });

  useEffect(() => {
    if (!enabled) return;
    const sock = getSocket();
    const stables: Record<string, Listener> = {};
    for (const event of Object.keys(listenersRef.current)) {
      stables[event] = (...args: unknown[]) =>
        listenersRef.current[event]?.(...args);
      sock.on(event, stables[event]);
    }

    const onR = () => reconnectRef.current?.();
    sock.io.on("reconnect", onR);

    return () => {
      for (const [event, stable] of Object.entries(stables)) {
        sock.off(event, stable);
      }
      sock.io.off("reconnect", onR);
    };
    // Re-run only when `enabled` changes; listeners are read through a ref.
  }, [enabled]);
}

/**
 * Join an auction room and subscribe to events for as long as the component
 * is mounted (or auctionId changes).
 *
 * Phase E9: on reconnect, re-emit `auction:join` (the server-side room
 * membership was lost when the socket dropped) and then call `onReconnect`
 * so the component can refetch any state that drifted. Without the re-join,
 * subscribed events would never reach the client even though the listener
 * stayed registered.
 */
export function useAuctionRoom(
  auctionId: string | undefined,
  listeners: Record<string, Listener>,
  onReconnect?: () => void
) {
  const listenersRef = useRef(listeners);
  const reconnectRef = useRef(onReconnect);
  // Sync the latest listeners/onReconnect into refs from an effect (writing a
  // ref during render is disallowed). Reads happen only in socket callbacks.
  useEffect(() => {
    listenersRef.current = listeners;
    reconnectRef.current = onReconnect;
  });

  useEffect(() => {
    if (!auctionId) return;
    const sock = getSocket();
    sock.emit("auction:join", auctionId);

    const stables: Record<string, Listener> = {};
    for (const event of Object.keys(listenersRef.current)) {
      stables[event] = (...args: unknown[]) =>
        listenersRef.current[event]?.(...args);
      sock.on(event, stables[event]);
    }

    const onR = () => {
      // Re-join first so the next events route correctly, then notify caller.
      sock.emit("auction:join", auctionId);
      reconnectRef.current?.();
    };
    sock.io.on("reconnect", onR);

    return () => {
      sock.emit("auction:leave", auctionId);
      for (const [event, stable] of Object.entries(stables)) {
        sock.off(event, stable);
      }
      sock.io.off("reconnect", onR);
    };
    // Re-run only when auctionId changes; the listener object is read via a ref.
  }, [auctionId]);
}
