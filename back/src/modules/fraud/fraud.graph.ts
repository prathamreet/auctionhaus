/**
 * Sliding-window bid graph.
 *
 * Maintains an in-memory record of all bids placed within the last
 * WINDOW_MINUTES across all active auctions. The graph is a lightweight
 * adjacency structure — no external graph library required.
 *
 * Data model:
 *  - `auctionBids`  : auctionId → ordered list of BidEvent (most-recent last)
 *  - `bidderHistory`: bidderId → list of BidEvent across all auctions (window)
 *
 * The window is pruned lazily: when a new bid arrives, events older than
 * WINDOW_MS are evicted from both maps.
 */

import { BidEvent } from './fraud.types';

/** Sliding window width in minutes. */
export const WINDOW_MINUTES = 30;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

export class BidGraph {
  /** Per-auction ordered bid history. */
  private auctionBids = new Map<string, BidEvent[]>();
  /** Per-bidder ordered bid history across all auctions. */
  private bidderHistory = new Map<string, BidEvent[]>();

  /** Record a new bid and prune stale entries. */
  add(event: BidEvent): void {
    this.prune(event.ts);

    if (!this.auctionBids.has(event.auctionId)) {
      this.auctionBids.set(event.auctionId, []);
    }
    this.auctionBids.get(event.auctionId)!.push(event);

    if (!this.bidderHistory.has(event.bidderId)) {
      this.bidderHistory.set(event.bidderId, []);
    }
    this.bidderHistory.get(event.bidderId)!.push(event);
  }

  /** All bids in the window for an auction (oldest → newest). */
  getAuctionBids(auctionId: string): BidEvent[] {
    return this.auctionBids.get(auctionId) ?? [];
  }

  /** All bids in the window for a bidder across all auctions. */
  getBidderHistory(bidderId: string): BidEvent[] {
    return this.bidderHistory.get(bidderId) ?? [];
  }

  /**
   * How many distinct seller IDs does a bidder appear with in the window?
   * Filters to a specific seller for the co-occurrence feature.
   */
  bidderSellerCoOccurrence(bidderId: string, sellerId: string): number {
    const history = this.getBidderHistory(bidderId);
    const auctionIds = new Set(
      history
        .filter((b) => b.sellerId === sellerId && b.bidderId !== sellerId)
        .map((b) => b.auctionId)
    );
    return auctionIds.size;
  }

  /**
   * Reciprocity score for an auction: for each ordered pair (A, B) of distinct
   * bidders, check if A ever outbid B AND B ever outbid A. Returns the fraction
   * of pairs that are mutually outbidding.
   */
  reciprocityScore(auctionId: string): number {
    const bids = this.getAuctionBids(auctionId);
    if (bids.length < 3) return 0;

    // Build outbid-pairs set
    const outbidPairs = new Set<string>();
    for (let i = 1; i < bids.length; i++) {
      const cur = bids[i];
      // Find the most recent bid by a different bidder before this one
      for (let j = i - 1; j >= 0; j--) {
        if (bids[j].bidderId !== cur.bidderId) {
          outbidPairs.add(`${cur.bidderId}→${bids[j].bidderId}`);
          break;
        }
      }
    }

    // Count mutually-outbidding pairs
    const bidderIds = [...new Set(bids.map((b) => b.bidderId))];
    let totalPairs = 0;
    let mutualPairs = 0;
    for (let i = 0; i < bidderIds.length; i++) {
      for (let j = i + 1; j < bidderIds.length; j++) {
        const a = bidderIds[i];
        const b = bidderIds[j];
        totalPairs++;
        if (outbidPairs.has(`${a}→${b}`) && outbidPairs.has(`${b}→${a}`)) {
          mutualPairs++;
        }
      }
    }
    return totalPairs === 0 ? 0 : mutualPairs / totalPairs;
  }

  /** Remove events older than the window from the current reference time. */
  private prune(nowMs: number): void {
    const cutoff = nowMs - WINDOW_MS;

    for (const [auctionId, bids] of this.auctionBids.entries()) {
      const trimmed = bids.filter((b) => b.ts >= cutoff);
      if (trimmed.length === 0) this.auctionBids.delete(auctionId);
      else if (trimmed.length !== bids.length) this.auctionBids.set(auctionId, trimmed);
    }

    for (const [bidderId, bids] of this.bidderHistory.entries()) {
      const trimmed = bids.filter((b) => b.ts >= cutoff);
      if (trimmed.length === 0) this.bidderHistory.delete(bidderId);
      else if (trimmed.length !== bids.length) this.bidderHistory.set(bidderId, trimmed);
    }
  }

  /** Snapshot for eval/debugging. */
  stats() {
    return {
      auctions: this.auctionBids.size,
      bidders: this.bidderHistory.size,
      totalBids: [...this.auctionBids.values()].reduce((s, v) => s + v.length, 0),
    };
  }
}
