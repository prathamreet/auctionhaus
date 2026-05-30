/**
 * Agent personas for the synthetic bidder simulator.
 *
 * Each agent implements a `bid()` method that decides whether and how much to
 * bid given the current auction state. Agents run in parallel; the simulator
 * loop polls auction state and calls `bid()` at intervals.
 *
 * ── Truthful ──────────────────────────────────────────────────────────────
 * Bids honestly: random timing (2–20 s intervals), random increments (1–3×
 * minIncrement), stops when price exceeds private valuation. Label: NOT shill.
 *
 * ── Sniper ────────────────────────────────────────────────────────────────
 * Waits until the last 10 % of auction time, then bids once at a high amount.
 * Timing signal: very low responseTimeMs if another bid triggers the snipe.
 * Label: NOT shill (legitimate strategy, though detectable).
 *
 * ── Shill ─────────────────────────────────────────────────────────────────
 * Controlled by the seller (separate account). Goals:
 *   1. Inflate price (bid minimum increments frequently).
 *   2. Never win (stops at seller's reserve price - 1 increment).
 *   3. Appear in many auctions from the same seller (high co-occurrence).
 * Response time: very fast (< 500 ms after competitor bids). Label: IS shill.
 *
 * ── Collusion ─────────────────────────────────────────────────────────────
 * Two coordinated accounts. A outbids B, B immediately outbids A, repeat. Both
 * are willing to push the price to a pre-agreed ceiling to lock out genuine
 * bidders. High reciprocity score. Label: IS shill.
 */

import type { AgentType } from './types';

export interface AuctionState {
  id: string;
  currentPrice: number;
  minIncrement: number;
  endTime: number;
  status: string;
  topBidderId?: string;
}

export interface BidDecision {
  shouldBid: boolean;
  amount?: number;
}

export class TruthfulAgent {
  readonly type: AgentType = 'truthful';
  readonly isShill = false;
  private valuation: number;
  private lastBidTs = 0;
  private intervalMs: number;

  constructor(startingPrice: number) {
    this.valuation = startingPrice * (1.5 + Math.random() * 2);
    this.intervalMs = (2 + Math.random() * 18) * 1000;
  }

  decide(state: AuctionState, myUserId: string): BidDecision {
    if (state.currentPrice >= this.valuation) return { shouldBid: false };
    const now = Date.now();
    if (now - this.lastBidTs < this.intervalMs) return { shouldBid: false };
    if (state.topBidderId === myUserId) return { shouldBid: false };

    const increment = state.minIncrement * (1 + Math.floor(Math.random() * 3));
    const amount = state.currentPrice + increment;
    if (amount > this.valuation) return { shouldBid: false };

    this.lastBidTs = now;
    this.intervalMs = (2 + Math.random() * 18) * 1000;
    return { shouldBid: true, amount };
  }
}

export class SniperAgent {
  readonly type: AgentType = 'sniper';
  readonly isShill = false;
  private hasBid = false;
  private valuation: number;

  constructor(startingPrice: number) {
    this.valuation = startingPrice * (2 + Math.random() * 3);
  }

  decide(state: AuctionState, _myUserId: string): BidDecision {
    if (this.hasBid) return { shouldBid: false };
    const remaining = state.endTime - Date.now();
    const total = state.endTime - (state.endTime - 60000); // assume 60s window
    if (remaining / Math.max(total, 1) > 0.15) return { shouldBid: false };

    const amount = Math.min(this.valuation, state.currentPrice + state.minIncrement * 5);
    this.hasBid = true;
    return { shouldBid: true, amount };
  }
}

export class ShillAgent {
  readonly type: AgentType = 'shill';
  readonly isShill = true;
  private lastBidTs = 0;
  private readonly ceiling: number;

  constructor(startingPrice: number, reservePrice: number) {
    this.ceiling = (reservePrice || startingPrice * 2) - startingPrice * 0.05;
  }

  decide(state: AuctionState, myUserId: string): BidDecision {
    if (state.currentPrice >= this.ceiling) return { shouldBid: false };
    if (state.topBidderId === myUserId) return { shouldBid: false };

    const now = Date.now();
    // Very fast response (200–800 ms) — primary shill signal
    const delay = 200 + Math.random() * 600;
    if (now - this.lastBidTs < delay) return { shouldBid: false };

    // Always exactly minimum increment — scripted increment signal
    const amount = state.currentPrice + state.minIncrement;
    if (amount > this.ceiling) return { shouldBid: false };

    this.lastBidTs = now;
    return { shouldBid: true, amount };
  }
}

export class CollusionAgent {
  readonly type: AgentType = 'collusion';
  readonly isShill = true;
  private lastBidTs = 0;
  private readonly ceiling: number;
  private bidsPlaced = 0;

  constructor(startingPrice: number, partnerId: string) {
    this.ceiling = startingPrice * (3 + Math.random() * 2);
    void partnerId; // used by the sim to detect partnership
  }

  decide(state: AuctionState, myUserId: string, topBidderId?: string): BidDecision {
    if (state.currentPrice >= this.ceiling) return { shouldBid: false };
    if (state.topBidderId === myUserId) return { shouldBid: false };
    // Only bid when the partner is currently winning (reciprocity pattern)
    if (topBidderId && topBidderId !== state.topBidderId) return { shouldBid: false };

    const now = Date.now();
    const delay = 300 + Math.random() * 500;
    if (now - this.lastBidTs < delay) return { shouldBid: false };

    const increment = state.minIncrement * (1 + Math.floor(Math.random() * 2));
    const amount = state.currentPrice + increment;
    if (amount > this.ceiling) return { shouldBid: false };

    this.bidsPlaced++;
    this.lastBidTs = now;
    return { shouldBid: true, amount };
  }
}
