/**
 * Real-time fraud detection engine.
 *
 * Lifecycle:
 *   1. `FraudEngine.getInstance()` returns the singleton; `init(io)` wires the
 *      Socket.io server so flags can be emitted to the admin room.
 *   2. After every successful bid commit, `bid.service.placeBid` calls
 *      `FraudEngine.getInstance().onBid(event)`.
 *   3. The engine adds the event to the sliding-window graph, extracts features,
 *      scores the classifier, and — if score ≥ SCORE_THRESHOLD — emits a
 *      `fraud:flag` event to the `admin:fraud` Socket.io room AND persists a
 *      FraudFlag row to Postgres (for the eval harness and admin inbox).
 *
 * The engine is a singleton because the graph must be shared across all
 * concurrent bid handlers. The graph is in-process; a future Phase D upgrade
 * could move it to a Redis hash for horizontal scaling.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import { BidGraph } from './fraud.graph';
import { extractFeatures } from './fraud.features';
import { score, explain, SCORE_THRESHOLD } from './fraud.classifier';
import { BidEvent, FraudFlagEvent } from './fraud.types';
import { prisma } from '../../lib/prisma';

export class FraudEngine {
  private static instance: FraudEngine;
  private graph = new BidGraph();
  private io: Server | null = null;

  private constructor() {}

  static getInstance(): FraudEngine {
    if (!FraudEngine.instance) {
      FraudEngine.instance = new FraudEngine();
    }
    return FraudEngine.instance;
  }

  /** Call once at server bootstrap (after Socket.io is initialised). */
  init(io: Server): void {
    this.io = io;
  }

  /**
   * Process an incoming bid event.
   * This is the hot path — it runs synchronously in the bid-service callstack
   * after the transaction commits. Features + scoring are O(n) where n is the
   * window size; typical latency < 1 ms.
   *
   * Persistence is fire-and-forget so a DB write never blocks the bid response.
   */
  async onBid(event: BidEvent): Promise<void> {
    // 1. Add to graph (this also prunes stale entries)
    this.graph.add(event);

    // 2. Extract features
    const features = extractFeatures(event, this.graph);

    // 3. Score
    const fraudScore = score(features);

    if (fraudScore < SCORE_THRESHOLD) return;

    // 4. Build flag event
    const flag: FraudFlagEvent = {
      id: uuidv4(),
      ts: event.ts,
      bidId: event.bidId,
      bidderId: event.bidderId,
      bidderName: event.bidderName,
      auctionId: event.auctionId,
      auctionTitle: event.auctionTitle,
      amount: event.amount,
      score: fraudScore,
      features,
      reason: explain(features, fraudScore),
    };

    // 5. Emit to admin room (non-blocking)
    if (this.io) {
      this.io.to('admin:fraud').emit('fraud:flag', flag);
    }

    // 6. Persist (fire-and-forget — eval harness reads this table)
    void prisma.fraudFlag
      .create({
        data: {
          id: flag.id,
          bidderId: flag.bidderId,
          auctionId: flag.auctionId,
          bidId: flag.bidId,
          score: flag.score,
          features: flag.features as object,
          reason: flag.reason,
        },
      })
      .catch((err: Error) => {
        console.warn('[FraudEngine] Failed to persist flag:', err.message);
      });
  }

  /** Called by the eval harness after a sim run to reset the graph. */
  reset(): void {
    this.graph = new BidGraph();
  }

  graphStats() {
    return this.graph.stats();
  }
}
