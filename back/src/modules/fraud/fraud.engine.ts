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
import { performance } from 'node:perf_hooks';
import { BidGraph } from './fraud.graph';
import { extractFeatures } from './fraud.features';
import { score, explain, SCORE_THRESHOLD } from './fraud.classifier';
import { BidEvent, FraudFlagEvent } from './fraud.types';
import { prisma } from '../../lib/prisma';

/**
 * Per-bid latency histogram. Backs the "sub-millisecond per bid" claim in
 * paper/main.tex Section II. Reservoir of the most recent 1024 samples is
 * kept in a ring buffer so the cost stays O(1) per add. Percentiles are
 * computed lazily on read by sorting the reservoir snapshot.
 */
const RESERVOIR_SIZE = 1024;

class LatencyRing {
  private buf = new Float64Array(RESERVOIR_SIZE);
  private idx = 0;
  private full = false;
  private totalSamples = 0;

  add(ms: number): void {
    this.buf[this.idx] = ms;
    this.idx = (this.idx + 1) % RESERVOIR_SIZE;
    if (this.idx === 0) this.full = true;
    this.totalSamples++;
  }

  snapshot(): { p50: number; p95: number; p99: number; max: number; samples: number; reservoirSize: number } {
    const size = this.full ? RESERVOIR_SIZE : this.idx;
    if (size === 0) {
      return { p50: 0, p95: 0, p99: 0, max: 0, samples: 0, reservoirSize: 0 };
    }
    const arr = Array.from(this.buf.subarray(0, size)).sort((a, b) => a - b);
    const pick = (q: number) => arr[Math.min(size - 1, Math.floor(q * size))];
    return {
      p50: Number(pick(0.5).toFixed(4)),
      p95: Number(pick(0.95).toFixed(4)),
      p99: Number(pick(0.99).toFixed(4)),
      max: Number(arr[size - 1].toFixed(4)),
      samples: this.totalSamples,
      reservoirSize: size,
    };
  }

  reset(): void {
    this.buf = new Float64Array(RESERVOIR_SIZE);
    this.idx = 0;
    this.full = false;
    this.totalSamples = 0;
  }
}

export class FraudEngine {
  private static instance: FraudEngine;
  private graph = new BidGraph();
  private io: Server | null = null;
  private latency = new LatencyRing();

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
    // The hot-path block (graph.add + extractFeatures + score) is what the
    // paper's "extra work per bid stays under a millisecond" claim refers to.
    // We time it explicitly so the claim has a live measurement behind it.
    const t0 = performance.now();

    // 1. Add to graph (this also prunes stale entries)
    this.graph.add(event);

    // 2. Extract features
    const features = extractFeatures(event, this.graph);

    // 3. Score
    const fraudScore = score(features);

    const elapsedMs = performance.now() - t0;
    this.latency.add(elapsedMs);

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
    this.latency.reset();
  }

  graphStats() {
    return this.graph.stats();
  }

  /**
   * Snapshot of per-bid scoring latency (p50, p95, p99, max) over the most
   * recent 1024 events. Backs the paper's sub-millisecond claim (main.tex
   * Section II) and pairs with graphStats() to back the memory bound
   * (supplementary.tex Theorem 2). Exposed at GET /api/admin/fraud/perf.
   */
  perfStats() {
    return {
      latencyMs: this.latency.snapshot(),
      graph: this.graph.stats(),
      threshold: SCORE_THRESHOLD,
    };
  }

  /** Reset only the latency histogram (graph state is preserved). */
  resetPerf(): void {
    this.latency.reset();
  }
}
