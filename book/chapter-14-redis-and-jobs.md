# Chapter 10 — Redis and Background Jobs

## Redis: One Tool, Four Jobs

Redis is described in its documentation as "an in-memory data structure store." That is accurate but understates how many different things it does in AuctionHaus. The system opens four distinct Redis connections, each serving a different purpose.

Understanding why we need four connections (instead of one) requires understanding that Redis is stateful: once you issue `SUBSCRIBE` on a connection, that connection is in subscriber mode and can only handle pub/sub commands. You cannot also use it for `XADD` or BullMQ commands. Hence the separation.

---

## The Four Redis Connections

### Connection 1: `redis` (General)

The main multipurpose connection. Used for:
- BullMQ job queue operations (ZADD, LPUSH, etc.) — the `bullMQConnection` is actually this connection cast to the BullMQ-compatible type
- Auth middleware user cache invalidation: `redis.publish('user:invalidate', userId)`
- `XLEN` check in the BidSequencer (backpressure)

### Connection 2: `bullMQConnection`

The same `redis` object, typed differently for BullMQ. BullMQ manages all job queue state in Redis: pending jobs (sorted set by delay time), active jobs (list), completed jobs, failed jobs. Every time you call `queue.add(...)`, BullMQ writes a sorted set entry to Redis. Every time the worker processes a job, it reads from and writes to these data structures.

BullMQ uses Redis sorted sets (ZADD/ZRANGE) for delayed job scheduling: the score is the execution timestamp, so a `ZRANGEBYSCORE 0 now` fetches all jobs that are due to run.

### Connection 3: `redisPub`

Dedicated publisher for the Socket.io Redis adapter. The adapter uses this to publish socket events to a Redis Pub/Sub channel. All server instances subscribe to this channel and forward the events to their local sockets.

Why dedicated? The Socket.io adapter sends a lot of messages — one for every socket event that crosses instances. If it shared the general connection, it would compete with BullMQ operations.

### Connection 4: `redisInvalidateSub`

Dedicated subscriber for the `user:invalidate` pub/sub channel (added in Phase A9.x). When `admin.suspendUser` calls `redis.publish('user:invalidate', userId)`, all instances receive the message on this connection and call `invalidateUser(userId)` to clear the suspended user from their in-memory auth cache.

Why not the same connection as `redisSub`? Because `redisSub` is in subscriber mode for the Socket.io adapter's internal channels. Mixing our application-level channels would couple us to the adapter's internal protocol.

---

## BullMQ: The Job Queue

BullMQ manages delayed and background work. AuctionHaus has four queues and four workers.

### Queue 1: auction-scheduler

```typescript
const auctionQueue = new Queue('auction-scheduler', { connection: bullMQConnection });
```

**Job: `start-auction`**
- Scheduled when an auction is created: `delay = startTime - now`
- When it fires: sets auction to ACTIVE, starts Dutch price-drop job if applicable, notifies watchlist users

**Job: `end-auction`**
- Scheduled when an auction is created: `delay = endTime - now`
- When it fires: calls `endAuction(auctionId)`
- If anti-sniping extends the endTime, the new `end-auction` job replaces the old one

### Queue 2: dutch-auction

```typescript
const dutchAuctionQueue = new Queue('dutch-auction', { connection: bullMQConnection });
```

**Job: `drop-price`**
- Created with `repeat: { every: dutchInterval * 1000, jobId: auctionId }`
- The `jobId` = auctionId means BullMQ deduplicates: you cannot have two repeat jobs for the same auction
- Fires every N seconds while the auction is ACTIVE
- Drops price by `dutchPriceStep`, checks auto-bid matches

### Queue 3: auto-bid

```typescript
const autoBidQueue = new Queue('auto-bid', { connection: bullMQConnection });
```

**Job: `process-ladder`**
- Enqueued by `placeBid` after the manual bid commits
- Processed by `autoBidWorker`
- The ladder runs atomically, then `bid:ladder` is emitted

### Queue 4: notifications

```typescript
const notificationQueue = new Queue('notifications', { connection: bullMQConnection });
```

**Job: `deliver`**
- Enqueued by `notifyUser()` calls (which happen after bid transactions)
- Processed by `notificationWorker`
- Writes the Notification row to Postgres, then emits `notification:new` over Socket.io

This queue was dead code in the original codebase — declared but never produced or consumed. Activating it moved notification DB writes off the bid transaction's critical path, reducing bid latency.

### Worker Configuration

```typescript
const workerOptions = {
  connection: bullMQConnection,
  stalledInterval: 300000,  // 5 minutes
  maxStalledCount: 1
};
```

`stalledInterval`: BullMQ periodically checks for "stalled" jobs — jobs that were marked active but whose worker has not sent a heartbeat. If a worker crashes mid-job, after `stalledInterval` the job is re-queued for retry.

`maxStalledCount: 1`: After 1 stall, the job is moved to the failed set rather than retried indefinitely. This prevents infinite retry loops for systematically failing jobs.

---

## The Notification Queue Pattern: Why It Matters

Here is the before-and-after of bid latency for a simple bid:

**Before (inline notifications):**
```
open transaction
  → bid validation
  → wallet lock + update
  → bid insert
  → notifyUser (OUTBID) → prisma.notification.create  ← inside tx!
  → io.emit (OUTBID)                                   ← blocks tx!
close transaction
→ emit bid:new
```

The notification write is inside the transaction. The socket emit happens before the transaction commits (or after — either way, it adds latency to the critical path). If the notification write fails, the whole bid rolls back.

**After (queued notifications):**
```
open transaction
  → bid validation
  → wallet lock + update
  → bid insert
close transaction
→ notificationQueue.add('deliver', ...)  ← after commit, non-blocking
→ emit bid:new                           ← immediate
```

The bid response returns as soon as the transaction commits and the event emits. The notification worker handles the DB write and socket push asynchronously. Bid latency drops. Notification failures (if any) do not affect the bid.

---

## Redis Streams: The Bid Sequencer

Redis Streams (introduced in Redis 5.0) are append-only log structures. Each entry has:
- An auto-generated ID (millitimestamp + sequence number, e.g., `1717238400000-3`)
- A set of field-value pairs (like a mini JSON blob)

### Why Use Streams for Bidding?

The core problem with direct Postgres row locking under high concurrency:

```
100 clients all do POST /api/bids/auctions/:id simultaneously
Each tries to SELECT * FROM auctions WHERE id=? FOR UPDATE
One acquires the lock; 99 wait
First commits; second acquires; 98 wait
...
Serial processing (one bid at a time) but with overhead of 100 concurrent connections
```

Under high concurrency, the lock contention creates a queue implicitly, but with the expensive overhead of 100 Postgres connections all holding open transactions waiting for their turn.

A Redis Stream makes the queue explicit and lightweight:

```
100 clients all do POST /api/bids/auctions/:id/stream
Each calls XADD auction:{id}:bids * { bidderId, amount, ts }
O(1) append, no contention, immediate return

One consumer:
XREADGROUP GROUP bid-processors c1 COUNT 1 BLOCK 1000 STREAMS auction:{id}:bids >
→ pops one entry
→ calls placeBid (Postgres transaction, no contention because serial)
→ XACK auction:{id}:bids bid-processors <entryId>
→ loops
```

The 100 clients all return immediately (the XADD is O(1)). The consumer processes bids one at a time, keeping Postgres transactions short and contention-free.

### Backpressure Detection

If the consumer is too slow (Postgres is overloaded, the server is busy), entries accumulate in the stream. Unchecked, this could grow unboundedly.

The `BidSequencer.enqueue` method checks the stream length before adding:

```typescript
const len = await redis.xlen(`auction:${auctionId}:bids`);
if (len >= BID_STREAM_BACKPRESSURE) {  // default 750
  io.to('admin:fraud').emit('bid:backpressure', { auctionId, streamLength: len, threshold: 750 });
  throw createError('Bid queue saturated, try again shortly', 503);
}
```

`XLEN` is O(1) — it reads the stream's metadata. The backpressure threshold (750) is set below the stream's MAXLEN trim (1000), so there is always headroom before entries start being silently dropped.

---

## The Cache Invalidation Protocol

Every server instance maintains an in-memory Map<userId, {user, expiresAt}> for auth. This avoids a Postgres query on every authenticated request.

When an admin suspends a user:

```typescript
// admin.service.ts
await prisma.user.update({ where: { id: userId }, data: { isSuspended: true } });
invalidateUser(userId);                    // clears local cache on this instance
redis.publish('user:invalidate', userId);  // tell all other instances
```

Every instance has a subscriber:

```typescript
// back/src/index.ts
redisInvalidateSub.subscribe('user:invalidate', (message) => {
  invalidateUser(message);  // clears cache on this instance
});
```

The suspended user's tokens stop working within milliseconds across all instances, regardless of the TTL.

Without this: a suspended user on Instance 2 could continue making authenticated requests for up to 30 seconds (the cache TTL) after the admin suspended them on Instance 1.

---

## The Dutch Auction Repeat Job — A Corner Case

When a Dutch auction is created and starts immediately (startTime <= now), the start-auction BullMQ job's delay is negative. BullMQ fires it immediately. But within the start-auction handler, the Dutch price-drop job needs to be created too.

There is a subtle bug to avoid: if the repeat job already exists (because the auction was already started), trying to create it again would fail. The job is created with `jobId: auctionId`, which BullMQ uses as a deduplication key for repeat jobs. Creating it twice with the same jobId is a no-op — the existing job is not duplicated.

When a Dutch auction is cancelled, the repeat job must be removed:

```typescript
await dutchAuctionQueue.removeRepeatable('drop-price', { jobId: auctionId });
```

If this is not done, the price-drop job keeps firing on a cancelled auction. The worker handles this gracefully:

```typescript
if (!auction || auction.status !== AuctionStatus.ACTIVE) return;
```

But the ghost job wastes Redis and Postgres resources. Cancelling the repeat job is the correct cleanup.

---

## Next Chapter

Chapter 11 is the research contribution chapter — real-time fraud detection. The sliding-window bid graph, five features, logistic regression classifier, and the admin dashboard.
