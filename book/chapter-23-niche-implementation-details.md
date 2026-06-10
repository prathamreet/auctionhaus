# Chapter 24 — Niche Implementation Details

## What This Chapter Is

This chapter collects every subtle, non-obvious implementation detail that does not have a natural home in the other chapters. These are the things that trip up developers who read the code carefully and ask "wait, why is it done that way?" Each has a reason.

---

## 1. The `isDecimalLike` Duck-Type Check in `decimal.ts`

In `serializeMoney`, the function needs to detect whether a value is a `Prisma.Decimal` instance so it can call `.toNumber()`.

The obvious approach is `instanceof`:
```typescript
if (v instanceof Prisma.Decimal) { ... }
```

But this fails in a specific scenario: **re-bundled packages**. When the Prisma client is loaded from different module instances (e.g., in a test runner that re-requires the module, or in a bundler that splits the package), `instanceof` checks the class reference — and two different class references for "the same" class from different bundles are not equal.

The fix is a duck-type check: look for the structural properties that identify a Decimal, rather than the class identity:

```typescript
const isDecimalLike = (v: unknown): v is Prisma.Decimal => {
  if (v === null || typeof v !== 'object') return false;
  if (v instanceof Prisma.Decimal) return true;
  // Fallback duck-type: decimal.js instances have `.d` (digits array), `.e` (exponent), `.toNumber()`
  const o = v as { s?: unknown; e?: unknown; d?: unknown; toNumber?: unknown };
  return typeof o.toNumber === 'function' && Array.isArray(o.d) && typeof o.e === 'number';
};
```

The `instanceof` check is tried first (faster). The duck-type is the fallback for cross-bundle scenarios. Without this, `serializeMoney` would silently return a Decimal object as JSON instead of a number in test environments — leading to `{ "amount": { "s": 1, "e": 4, "d": [50000] } }` in API responses.

---

## 2. The `neg()` Helper for Debit Transactions

The Transaction ledger stores signed amounts: positive for credits, negative for debits. When recording a BID_HOLD (money leaving the balance), the amount is negative.

Naive code:
```typescript
await tx.transaction.create({
  data: {
    amount: -amountD,  // WRONG: JS unary minus doesn't work on Decimal objects
  }
});
```

JavaScript's unary `-` operator coerces the operand to a number first (`-Decimal(50000)` → `-50000` as a float), defeating the purpose of using Decimal.

The correct way:
```typescript
import { neg } from '../../lib/decimal';

await tx.transaction.create({
  data: {
    amount: neg(amountD),  // Decimal.neg() — exact negation, stays Decimal
  }
});
```

`neg(x) = D(x).neg()` uses the Decimal library's negation method. This is a one-liner helper but it protects against a subtle bug that would silently convert Decimal to float at exactly the moment you are recording a financial transaction.

---

## 3. The `$queryRaw` Escape Hatch for `FOR UPDATE`

Prisma's fluent API (`prisma.auction.findUnique(...)`) does not have a `.forUpdate()` method. This is a deliberate omission — Prisma's ORM model is optimistic by default, and SELECT FOR UPDATE is a pessimistic locking mechanism that Prisma's query builder does not support.

To use FOR UPDATE, you must escape to raw SQL:

```typescript
const [auction] = await tx.$queryRaw<AuctionRow[]>`
  SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE
`;
```

This is a tagged template literal (Prisma's `$queryRaw` API). The `${auctionId}` variable is automatically parameterised — there is NO string interpolation, so SQL injection is impossible. The output type is explicitly specified as `AuctionRow[]`.

After the lock is acquired, we use the regular Prisma API to fetch the full object:
```typescript
const auction = await tx.auction.findUnique({ where: { id: auctionId } });
```

Why two queries instead of one? Because `$queryRaw` returns a plain object, not a Prisma model with proper type inference, relations, and Decimal conversion. The two-step pattern (raw for lock, ORM for data) is a known pattern for Prisma + pessimistic locking.

---

## 4. FNV-1a Hash for Deterministic Train/Test Split

The simulator's dataset module uses FNV-1a (Fowler-Noll-Vo hash, variant 1a) for the train/test split:

```typescript
function fnv1a(str: string): number {
  let hash = 2166136261;  // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;  // FNV prime, 32-bit unsigned
  }
  return hash;
}

function isInTrainSet(bidId: string): boolean {
  return (fnv1a(bidId) % 100) < 75;  // 75% train, 25% test
}
```

Why FNV-1a and not:

**`Math.random()`?** Random is not deterministic. Two runs of the pipeline would produce different splits. A bid that was in the test set on run 1 might be in the train set on run 2. The evaluation results become incomparable between runs.

**SHA-256?** SHA-256 would also be deterministic, but it is 40× slower and the security properties are irrelevant here. We just need a fast, uniform hash.

**Modulo of a simple hash?** FNV-1a is specifically designed to produce uniform distributions across its bit range, avoiding the clustering that simple polynomial hashes produce. The `% 100` gives a roughly uniform probability (within 1%) of landing in the train set.

The key guarantee: given the same bid ID, `isInTrainSet` always returns the same answer. If you run the simulator multiple times, the same bid (identified by its database-assigned UUID) always lands in the same partition. This makes the training and evaluation results reproducible.

---

## 5. The Dutch Repeat Job `jobId` Deduplication

When creating a Dutch auction's price-drop job:

```typescript
await dutchAuctionQueue.add(
  'drop-price',
  { auctionId, step: auction.dutchPriceStep },
  { repeat: { every: auction.dutchInterval * 1000, jobId: auctionId } }
);
```

The `jobId: auctionId` option tells BullMQ to use the auction ID as the job's identity within the repeat schedule. This means:

1. If you try to add the same repeat job twice (because the auction start fires twice, or because of a race), BullMQ silently deduplicates — only one repeat job exists for that auction.

2. When you cancel the auction and want to stop the price drops, you remove the job by its repeat key:
   ```typescript
   await dutchAuctionQueue.removeRepeatable('drop-price', { jobId: auctionId });
   ```
   Without the `jobId`, you cannot reliably target the specific repeat job for removal.

Without the `jobId`, a race between the `start-auction` job and the immediate-start path in `createAuction` could create two repeat jobs for the same auction, causing the price to drop twice as fast.

---

## 6. Why Socket Auth Uses `handshake.auth` Not `handshake.headers`

Socket.io connections are established with a WebSocket upgrade request. HTTP headers are available during the upgrade. The backend validates the token from `socket.handshake.auth.token`.

Why not `socket.handshake.headers.authorization`?

Because the Socket.io client library (`socket.io-client`) sends `auth` in the first handshake message (after the WebSocket connection is established), not in the WebSocket upgrade HTTP headers. The HTTP headers at upgrade time include browser-managed headers (like `Cookie`, `Origin`) but the user-provided `auth` object is part of Socket.io's handshake protocol, sent as the first Socket.io packet.

This is the correct pattern for Socket.io authentication. Using `headers.authorization` would require the browser to send the JWT as a custom WebSocket header, which most browser WebSocket APIs do not support (the `WebSocket` constructor only accepts the URL and protocols, not custom headers).

---

## 7. The `socket.data.userId` Pattern

After successful authentication, the socket middleware attaches user info to the socket:

```typescript
socket.data.userId = decoded.id;
socket.data.role = decoded.role;
```

This is Socket.io's mechanism for storing per-connection state. `socket.data` is a plain object, per-connection, available throughout the connection's lifetime. Using it instead of a Map or closure means:

- Other parts of the gateway can access `socket.data.userId` without passing it around
- TypeScript can be extended with `declare module 'socket.io' { interface SocketData { userId: string; role: string; } }` for type safety
- The data is automatically cleaned up when the socket disconnects

---

## 8. Why `notifyUser` Is Called Before the Transaction Commits for Outbid

Looking at `bid.service.ts` carefully:

```typescript
// Inside the prisma.$transaction callback:
notifyUser(previousWinning.bidderId, {
  type: 'OUTBID',
  title: 'You were outbid!',
  // ...
});
```

Wait — this calls `notifyUser` inside the transaction. But `notifyUser` enqueues a BullMQ job, which is a Redis write. The bid transaction has not committed yet.

Is this a problem? The answer is nuanced:

**If the transaction commits:** The BullMQ job was enqueued before commit. The notification worker runs and sends the notification. Correct.

**If the transaction rolls back:** The BullMQ job was already enqueued. The worker will send an OUTBID notification for a bid that was never actually placed. The user gets a phantom "you were outbid" notification with no corresponding bid in the history.

This is a **phantom notification bug** — a known, accepted tradeoff in the current implementation. The fix would be to enqueue the notification only after the transaction commits (in the `after tx` section). It was not fixed in the current codebase because phantom notifications are annoying but not financially harmful. The correct architecture is to use an **outbox pattern**: write the notification intent to a table inside the transaction, and have a polling worker read and send from the outbox. But that is over-engineering for a college project.

---

## 9. The `@@index` vs Raw SQL for the GIN Index

The Prisma schema has:

```prisma
model Auction {
  // ...
  @@index([status])
  @@index([endTime])
  @@index([type, status])
  // Note: GIN tsvector index NOT declared here
}
```

The GIN index for full-text search is declared only in the migration SQL:

```sql
-- 20260528000001_perf_indexes/migration.sql
CREATE INDEX "auctions_title_description_fts_idx"
ON "auctions"
USING gin (to_tsvector('english', title || ' ' || description));
```

Why is it not in `@@index`? Because Prisma's schema language cannot express:
- Functional indexes (indexes on `f(column)` rather than a column directly)
- Index methods other than B-tree (GIN, BRIN, Hash, GiST)
- Expression indexes

The `@@index` directive in Prisma schema creates only B-tree indexes on column values. For anything more complex, you write raw SQL in a migration.

The schema has a comment:
```prisma
// The GIN tsvector(title || ' ' || description) FTS index is in raw SQL only
// -- Prisma cannot express it -- see migration 20260528000001_perf_indexes
```

This is a common pattern: `@@index` for standard indexes, raw migration SQL for anything more complex. The two must be kept in sync manually — Prisma will not warn you if the raw index exists but has no `@@index` counterpart.

---

## 10. The `same-bidder re-bid` Edge Case

What happens if Alice is the current WINNING bidder and tries to raise her own bid?

In `placeBid`:
```typescript
// Check for previous WINNING bid
const prev = await tx.bid.findFirst({
  where: { auctionId, status: 'WINNING' },
  select: { bidderId: true },
});
if (prev && prev.bidderId !== bidderId) previousWinnerId = prev.bidderId;
// If prev.bidderId === bidderId, previousWinnerId stays null
```

But later:
```typescript
} else if (previousWinning && previousWinning.bidderId === bidderId) {
  // Same bidder increasing their bid: release old hold first
  await tx.bid.update({ where: { id: previousWinning.id }, data: { status: 'OUTBID' } });
  await tx.wallet.update({
    where: { id: previousWinning.bidder.wallet!.id },
    data: {
      balance: { increment: previousWinning.amount },
      heldAmount: { decrement: previousWinning.amount },
    },
  });
```

Alice's previous bid is marked OUTBID and her held amount is released. Then the new (higher) bid is created and her wallet hold is set to the new amount. She never has two bid holds simultaneously.

This is a correctly handled edge case. Without it, a bidder who raised their own bid would have two amounts held simultaneously — double-escrowing their own raise.

---

## 11. The Anti-Snipe Ownership Comment

In `workers/index.ts`:
```typescript
// Note: anti-snipe extension is only triggered by the manual bid that
// starts the ladder. The auto-bid steps in the ladder do NOT extend
// the endTime, even though they arrive rapidly. This is intentional:
// the anti-snipe is about human sniping (last-second manual bid), not
// about the automated resolution of proxy bids.
```

The anti-snipe logic runs in `placeBid`:
```typescript
// Anti-snipe check (only for ENGLISH, only if not already auto-bid)
if (auction.type === AuctionType.ENGLISH && !isAutoBid) {
  const remaining = auction.endTime.getTime() - Date.now();
  if (remaining < auction.antiSnipingMins * 60 * 1000) {
    const newEndTime = new Date(auction.endTime.getTime() + auction.antiSnipingMins * 60 * 1000);
    // update auction.endTime
  }
}
```

The `!isAutoBid` guard means auto-bid ladder steps (which call `placeBid` with `isAutoBid: true`) do not trigger the anti-snipe extension. Only the triggering manual bid extends the time. Without this guard, a ladder of 20 steps would extend the auction by `20 × antiSnipingMins` — hours of extension from one human snipe.

---

## 12. The `available = balance - heldAmount` Formula

The "spendable" wallet amount is always computed as:

```typescript
const available = D(wallet.balance).sub(wallet.heldAmount);
if (available.lt(amountD)) throw createError('Insufficient available balance', 400);
```

This formula appears in `placeBid`, `withdraw`, `setAutoBid`, and the ladder worker. It is the single invariant: **you can only spend what is not already held**.

A user with `balance=100, heldAmount=80` has `available=20`. They cannot place a bid for ₹50 even though their total balance appears to be ₹100. The ₹80 is locked in active bids.

This prevents the "ghost bid" problem: a user who is winning 5 auctions simultaneously and has funds held in all of them cannot place a 6th bid without having actual free funds.

---

## 13. The `stalledInterval` and `maxStalledCount` in BullMQ

```typescript
const workerOptions = {
  connection: bullMQConnection,
  stalledInterval: 300000,  // 5 minutes
  maxStalledCount: 1,
};
```

**`stalledInterval`:** BullMQ periodically runs a "stall check" — a Lua script that finds jobs that are marked "active" (being processed) but whose workers have not sent a heartbeat recently. If a job is stalled, it is re-queued for retry. Lower values = faster recovery but more Redis Lua script overhead.

300 seconds (5 minutes) was chosen because the ladder transaction should never take more than a minute. If the worker is still "processing" after 5 minutes, it has certainly crashed or hung.

**`maxStalledCount: 1`:** After 1 stall, the job is moved to the "failed" queue rather than retried indefinitely. This prevents infinite retry loops for jobs that consistently hang (e.g., because the database is down and every attempt times out). A stuck job that retries 100 times would flood the Postgres connection pool.

Setting `maxStalledCount: 1` means one stall = one automatic retry, then the job goes to failed. An admin or monitoring system can then decide what to do. This is conservative but safe for financial operations.

---

## 14. The `serverTs` Field Was Added After Everything Else

`serverTs: Date.now()` was added to `bid:new` and `bid:ladder` payloads in Phase E10 — one of the last engineering tasks.

Before this, the frontend used the time of receiving the socket event as the timestamp for the bid. This meant:
- On a slow network, a bid placed at 12:00:00.000 might arrive at the frontend at 12:00:02.500
- The frontend would display "placed 2.5 seconds ago" when it was actually just placed
- The fraud engine used server timestamps internally but the admin dashboard showed client-received timestamps — inconsistent

After `serverTs`, the frontend computes "X seconds ago" as `Date.now() - serverTs`, using the server's authoritative timestamp. This aligns the bid history display, the fraud flag timeline, and any other time-based UI with the server's view of when events happened.

The `serverTs` convention propagates everywhere: `bid:new`, `bid:ladder`, and `bid:backpressure` all include it.

---

## Next Chapter

Chapter 25 does deep dives into each auction type's complete lifecycle — every edge case for English, Dutch, and Sealed-Bid auctions.
