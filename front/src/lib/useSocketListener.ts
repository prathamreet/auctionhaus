"use client";
import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";

type Listener = (...args: unknown[]) => void;

/**
 * Subscribe to a single socket event for the lifetime of the component.
 * `handler` may change each render — the hook always calls the latest version
 * without re-subscribing (stored in a ref).
 */
export function useSocketListener(
  event: string,
  handler: Listener,
  enabled: boolean = true
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const sock = getSocket();
    const stable: Listener = (...args) => handlerRef.current(...args);
    sock.on(event, stable);
    return () => {
      sock.off(event, stable);
    };
    // Re-run only when event or enabled changes, not handler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, enabled]);
}

/**
 * Subscribe to multiple events at once.
 * `listeners` object identity may change — each listener is wrapped in a ref
 * so the actual socket subscription is stable.
 */
export function useSocketListeners(
  listeners: Record<string, Listener>,
  enabled: boolean = true
) {
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  useEffect(() => {
    if (!enabled) return;
    const sock = getSocket();
    const stables: Record<string, Listener> = {};
    for (const event of Object.keys(listenersRef.current)) {
      stables[event] = (...args: unknown[]) =>
        listenersRef.current[event]?.(...args);
      sock.on(event, stables[event]);
    }
    return () => {
      for (const [event, stable] of Object.entries(stables)) {
        sock.off(event, stable);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

/**
 * Join an auction room and subscribe to events for as long as the component
 * is mounted (or auctionId changes).
 */
export function useAuctionRoom(
  auctionId: string | undefined,
  listeners: Record<string, Listener>
) {
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

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

    return () => {
      sock.emit("auction:leave", auctionId);
      for (const [event, stable] of Object.entries(stables)) {
        sock.off(event, stable);
      }
    };
    // Re-run only when auctionId changes, not the listener object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);
}
