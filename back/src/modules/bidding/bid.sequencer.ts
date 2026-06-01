/**
 * Phase C7 — Redis Stream Bid Sequencer (W2)
 *
 * Architecture overview:
 *   Every bid is published to a per-auction Redis Stream:
 *     Key: auction:{auctionId}:bids
 *     Entry: { bidderId, amount, ts }
 *
 *   A single BullMQ-style consumer (one per auction key at a time) reads the
 *   stream, calls the existing placeBid service function, and acknowledges the
 *   entry. This achieves serial ordering per auction at the Redis layer instead
 *   of relying solely on Postgres FOR UPDATE row locks.
 *
 * Why this matters for the paper:
 *   The existing approach serialises bids using Postgres row locks. Under high
 *   concurrency (50+ concurrent bidders) the lock wait queue on the auction row
 *   becomes the bottleneck. The Redis Stream approach moves the queue upstream,
 *   so Postgres only ever sees one inflight write per auction at a time.
 *   The eval script (C5) benchmarks both approaches to generate the throughput
 *   comparison table in the paper (§5.3 Performance Evaluation).
 *
 * Consumer group: 'bid-processors'
 * Consumer name:  'worker-{process.pid}'
 *
 * Usage:
 *   // Producer (bid.controller.ts alternate route):
 *   await BidSequencer.getInstance().enqueue(auctionId, bidderId, amount);
 *
 *   // Consumer (started in workers/index.ts):
 *   BidSequencer.getInstance().startConsumer();
 *
 * The sequencer is OPTIONAL — the existing placeBid endpoint still works.
 * Enable it with the env flag BID_SEQUENCER=true.
 */

import { redis } from '../../lib/redis';
import { placeBid } from './bid.service';
import { io } from '../../index';
import { serializeMoney } from '../../lib/decimal';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';

const STREAM_TTL_ENTRIES = 1000; // trim stream to last 1000 entries per auction
const CONSUMER_GROUP = 'bid-processors';
const BLOCK_MS = 2000; // XREADGROUP block timeout

// Phase E6: backpressure threshold. If the unconsumed stream length exceeds
// this, enqueue rejects with 503 and emits a `bid:backpressure` event to the
// admin room. Configurable via env (BID_STREAM_BACKPRESSURE) so a load test
// can lower it to trigger the path deliberately. The default sits below the
// STREAM_TTL_ENTRIES MAXLEN trim threshold, so we warn before the stream
// starts dropping older entries.
const BACKPRESSURE_THRESHOLD = (() => {
  const raw = parseInt(process.env.BID_STREAM_BACKPRESSURE ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 750;
})();

export class BidSequencer {
  private static instance: BidSequencer;
  private running = false;

  private constructor() {}

  static getInstance(): BidSequencer {
    if (!BidSequencer.instance) {
      BidSequencer.instance = new BidSequencer();
    }
    return BidSequencer.instance;
  }

  streamKey(auctionId: string) {
    return `auction:${auctionId}:bids`;
  }

  /** Producer: publish a bid command to the auction stream. */
  async enqueue(auctionId: string, bidderId: string, amount: number): Promise<string> {
    const key = this.streamKey(auctionId);

    // Phase E6: backpressure check before XADD. If the stream is saturated,
    // the consumer is falling behind and accepting more entries just delays
    // the response further (or worse, pushes older un-consumed entries past
    // the MAXLEN trim threshold and silently drops them).
    //
    // We check XLEN -- which is O(1) -- and reject with 503 if over the
    // threshold. A `bid:backpressure` event goes to the admin:fraud room so
    // an operator sees the saturation in real time. The bidder gets a clean
    // "service unavailable" instead of a silently-dropped bid.
    //
    // .catch(() => 0) means: if Redis is down, XLEN returns 0 and we let the
    // XADD attempt proceed -- the XADD itself will fail loudly. Treating a
    // Redis error here as "backpressure" would mask the real fault.
    const currentLen = await redis.xlen(key).catch(() => 0);
    if (currentLen >= BACKPRESSURE_THRESHOLD) {
      if (io) {
        io.to('admin:fraud').emit('bid:backpressure', {
          auctionId,
          streamLength: currentLen,
          threshold: BACKPRESSURE_THRESHOLD,
          ts: Date.now(),
        });
      }
      throw createError(
        `Bid stream saturated for auction ${auctionId} ` +
          `(${currentLen} pending, threshold ${BACKPRESSURE_THRESHOLD}). Retry shortly.`,
        503,
      );
    }

    const entryId = await redis.xadd(
      key,
      'MAXLEN', '~', String(STREAM_TTL_ENTRIES),
      '*',
      'bidderId', bidderId,
      'amount', String(amount),
      'ts', String(Date.now())
    ) as string;

    // Ensure the consumer group exists (idempotent)
    await redis.xgroup('CREATE', key, CONSUMER_GROUP, '0', 'MKSTREAM').catch((e: Error) => {
      if (!e.message.includes('BUSYGROUP')) throw e;
    });

    return entryId;
  }

  /** Consumer: start reading from all auction streams in a loop. */
  startConsumer(): void {
    if (this.running) return;
    this.running = true;
    const workerName = `worker-${process.pid}`;
    console.log(`[BidSequencer] consumer '${workerName}' started`);
    void this.consumeLoop(workerName);
  }

  stop(): void {
    this.running = false;
  }

  private async consumeLoop(workerName: string): Promise<void> {
    while (this.running) {
      try {
        // Read from ALL streams matching 'auction:*:bids' via a single XREADGROUP.
        // We use a wildcard-free approach: maintain a known set of streams that
        // have active consumer groups (populated by enqueue).
        //
        // Simplified: scan for streams with the consumer group, read from each.
        // A production deployment would use a stream-registry; for the benchmark
        // we read from a fixed set of recently-active streams.
        const activeKeys = await this.getActiveStreamKeys();
        if (activeKeys.length === 0) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        // Build XREADGROUP args: reads up to 10 entries per stream
        const args: string[] = [
          'GROUP', CONSUMER_GROUP, workerName,
          'COUNT', '10',
          'BLOCK', String(BLOCK_MS),
          'STREAMS',
          ...activeKeys,
          ...activeKeys.map(() => '>'),
        ];

        const results = await (redis as any).xreadgroup(...args) as Array<[string, Array<[string, string[]]>]> | null;
        if (!results) continue;

        for (const [key, entries] of results) {
          const auctionId = key.replace(/^auction:/, '').replace(/:bids$/, '');
          for (const [entryId, fields] of entries) {
            await this.processEntry(auctionId, entryId, fields, key, workerName);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('ECONNREFUSED')) {
          console.error('[BidSequencer] consumer error:', msg);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async processEntry(
    auctionId: string,
    entryId: string,
    fields: string[],
    streamKey: string,
    workerName: string
  ): Promise<void> {
    // fields is a flat array: [key, value, key, value, ...]
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }

    const bidderId = map.bidderId;
    const amount = parseFloat(map.amount);

    if (!bidderId || isNaN(amount)) {
      await redis.xack(streamKey, CONSUMER_GROUP, entryId);
      return;
    }

    try {
      const bid = await placeBid({ auctionId, bidderId, amount });

      // Emit result back — same as the regular bid controller
      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: { currentPrice: true, endTime: true, status: true, _count: { select: { bids: true } } },
      });

      if (io && auction) {
        const payload = {
          bid: serializeMoney(bid),
          auction: serializeMoney(auction),
          sealed: false,
        };
        io.to(`auction:${auctionId}`).emit('bid:new', payload);
      }

      await redis.xack(streamKey, CONSUMER_GROUP, entryId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BidSequencer] bid failed (${entryId}):`, msg);
      // Ack anyway so a permanent-error bid doesn't block the stream.
      await redis.xack(streamKey, CONSUMER_GROUP, entryId);
    }
  }

  /** Discover active stream keys by scanning Redis for the pattern. */
  private async getActiveStreamKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'auction:*:bids', 'COUNT', '50');
      cursor = next;
      keys.push(...(batch as string[]));
    } while (cursor !== '0');
    return [...new Set(keys)];
  }

  /** Return stream stats for a given auction (used by the benchmark). */
  async streamStats(auctionId: string) {
    const key = this.streamKey(auctionId);
    const info = await redis.xlen(key).catch(() => 0);
    return { key, length: info };
  }
}
