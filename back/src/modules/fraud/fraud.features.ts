/**
 * Feature extraction — derives a FeatureVector from the bid graph for a
 * given incoming BidEvent.
 *
 * Features are designed to distinguish four agent types from the simulator:
 *   truthful   — bids occasionally, random timing, varied increments
 *   sniper     — bids once near auction close, high response time
 *   shill      — bids rapidly, minimum increments, same seller repeatedly
 *   collusion  — two accounts inflate price, high reciprocity
 *
 * Literature basis:
 *   Trevathan & Read (2007) — bid frequency and price inflation ratios
 *   Ford, Xu & Valova (2010) — bidder-seller co-occurrence and timing
 *   Tsang, Koh & Dobbie (2014) — graph-based collusion detection
 */

import { BidEvent, FeatureVector } from './fraud.types';
import { BidGraph, WINDOW_MINUTES } from './fraud.graph';

export function extractFeatures(event: BidEvent, graph: BidGraph): FeatureVector {
  const auctionBids = graph.getAuctionBids(event.auctionId);

  // ── 1. Response time ──────────────────────────────────────────────────────
  // Time since the last bid by a DIFFERENT bidder (ms). Default to 8000 (neutral mean) if first bid.
  let responseTimeMs = 8000;
  for (let i = auctionBids.length - 1; i >= 0; i--) {
    const prev = auctionBids[i];
    if (prev.bidderId !== event.bidderId) {
      responseTimeMs = event.ts - prev.ts;
      break;
    }
  }

  // ── 2. Bid frequency ──────────────────────────────────────────────────────
  // Bids placed by this bidder in the last WINDOW_MINUTES across all auctions,
  // normalised to bids/minute.
  const bidderHistory = graph.getBidderHistory(event.bidderId);
  const windowStart = event.ts - WINDOW_MINUTES * 60_000;
  const recentBids = bidderHistory.filter((b) => b.ts >= windowStart);
  const bidFrequencyPerMin =
    WINDOW_MINUTES > 0 ? recentBids.length / WINDOW_MINUTES : 0;

  // ── 3. Increment ratio ────────────────────────────────────────────────────
  // bid.increment / auction.minIncrement. Constant values near 1.0 = scripted.
  // If first bid, default to 5.0 (legitimate mean) to keep features neutral.
  let incrementAmount = event.amount;
  let hasPrev = false;
  if (auctionBids.length > 1) {
    const prevBid = auctionBids[auctionBids.length - 2];
    incrementAmount = event.amount - prevBid.amount;
    hasPrev = true;
  }
  const incrementRatio =
    event.minIncrement > 0
      ? (hasPrev ? incrementAmount / event.minIncrement : 5.0)
      : 1.0;

  // ── 4. Seller co-occurrence ───────────────────────────────────────────────
  // Number of distinct auctions by the same seller the bidder has appeared in.
  const sellerCoOccurrence = graph.bidderSellerCoOccurrence(
    event.bidderId,
    event.sellerId
  );

  // ── 5. Reciprocity ────────────────────────────────────────────────────────
  const reciprocityScore = graph.reciprocityScore(event.auctionId);

  return {
    responseTimeMs,
    bidFrequencyPerMin,
    incrementRatio,
    reciprocityScore,
    sellerCoOccurrence,
  };
}
