# Chapter 25 — The Three Auction Lifecycles

## Why Lifecycle Matters

Understanding an auction's lifecycle — from creation to settlement, including every edge case — is what separates a developer who "worked on the bid service" from one who "understands how the system works." This chapter walks through all three auction types end-to-end, including the things that can go wrong and how they are handled.

---

## English Auction Lifecycle

### Phase 1: Creation (PENDING → scheduling)

```
POST /api/auctions
{
  type: "ENGLISH",
  title: "Vintage Rolex",
  startingPrice: 10000,
  minIncrement: 1000,
  antiSnipingMins: 5,
  buyNowPrice: 80000,
  reservePrice: 15000,
  startTime: "2026-06-01T09:00:00Z",
  endTime:   "2026-06-01T11:00:00Z"
}
```

What happens:
1. Auction row created with `status = PENDING` (or `ACTIVE` if `startTime <= now`)
2. `currentPrice = startingPrice = 10000`
3. BullMQ job enqueued: `start-auction` with `delay = startTime - now`
4. BullMQ job enqueued: `end-auction` with `delay = endTime - now`

At startTime, the `start-auction` job fires: `status PENDING → ACTIVE`. Watchlist users notified.

### Phase 2: Bidding

**First bid (₹11,000):** `currentPrice = 10000 + 1000 = 11000` minimum. 

**Anti-sniping:** If a bid arrives in the last 5 minutes, `endTime += 5 minutes`. This happens in `placeBid` with the `!isAutoBid` guard — only manual bids trigger it. The auction emits `auction:extended { auctionId, newEndTime }`.

**Buy-now:** Any bidder can call `POST /api/auctions/:id/buy-now`. This calls `settleWithinTx(DIRECT_SALE)` immediately. The auction ends. All other bidders' holds are refunded. The `endAuction` BullMQ job, when it fires later, sees `status = ENDED` and is a no-op.

**Reserve not met:** If the auction ends with `currentPrice < reservePrice`, the winner does NOT automatically win. The status is set to ENDED with `winnerId = null`. The winner's hold is released. This is an edge case in `endAuction` that is handled by checking `auction.reservePrice && auction.currentPrice < auction.reservePrice`.

### Phase 3: Auto-Bid Resolution

After every manual bid, a `process-ladder` job is enqueued. The ladder:
1. Loads the auto-bid pool (all ACTIVE auto-bids except the just-bid bidder's)
2. Iteratively increments the price, creating bid rows, until no auto-bid can go higher
3. Emits one `bid:ladder` event with all steps

**Edge: ladder fires after auction ends.** The E4 guard: `if (Date.now() > auction.endTime.getTime()) return;` prevents the ladder from running on an already-ended auction. This race (BullMQ job pickup latency > time between auction end and ladder enqueue) is real at low concurrency.

**Edge: bidder cancels auto-bid during the ladder.** The ladder transaction is holding the auction lock. The `cancelAutoBid` call is serialised behind the ladder. When it runs, the auto-bid is already deactivated by the ladder's insufficient-balance check. The cancellation is a no-op or correctly deactivates a still-active auto-bid. No harm.

### Phase 4: End

At endTime (or extended endTime), the `end-auction` BullMQ job fires:

```typescript
async function endAuction(auctionId: string) {
  await prisma.$transaction(async tx => {
    // Lock the auction
    const [row] = await tx.$queryRaw`SELECT * FROM auctions WHERE id=${auctionId} FOR UPDATE`;
    if (!row || row.status !== 'ACTIVE') return;  // already ended — idempotent
    
    // Find winning bid
    const winningBid = await tx.bid.findFirst({
      where: { auctionId, status: 'WINNING' }
    });
    
    if (winningBid && (!auction.reservePrice || winningBid.amount >= auction.reservePrice)) {
      // Winner exists and reserve met
      await tx.bid.update({ where: { id: winningBid.id }, data: { status: 'WON' } });
      await settleWithinTx(tx, { kind: 'WON_AUCTION', payerId: winningBid.bidderId, ... });
    }
    
    // Set all remaining ACTIVE/WINNING bids to LOST (English: only WON, rest OUTBID already)
    // Set auction status to ENDED
    await tx.auction.update({ where: { id: auctionId }, data: { status: 'ENDED', winnerId: ..., winnerBidId: ... } });
  });
  
  io.to(`auction:${auctionId}`).emit('auction:ended', { auctionId, winnerId, finalPrice });
}
```

**Idempotency:** The `status !== 'ACTIVE'` check means a retried `end-auction` job sees `status = ENDED` and returns immediately. The `Settlement` row prevents double-payment.

---

## Dutch Auction Lifecycle

### Phase 1: Creation

```
POST /api/auctions
{
  type: "DUTCH",
  startingPrice: 80000,
  dutchPriceStep: 2000,
  dutchInterval: 300,   // 5 minutes
  reservePrice: 20000,
  endTime: "..."
}
```

The Dutch auction starts high and descends. The buyer race is: "how long do I wait before accepting?"

At auction start:
1. `status PENDING → ACTIVE`
2. BullMQ repeat job created: `drop-price` every 300 seconds with `jobId: auctionId`

### Phase 2: Price Drops

Every 300 seconds, the `dutchWorker` runs:

```typescript
const newPrice = D(auction.currentPrice).sub(step);

// If price hits 0 or below reserve: end the auction (no sale)
if (newPrice.lte(0) || (auction.reservePrice && newPrice.lt(auction.reservePrice))) {
  await endAuction(auctionId);
  return;
}

// Update price in DB FIRST
await prisma.auction.update({ where: { id: auctionId }, data: { currentPrice: newPrice } });

// Check auto-bid matches
const matchingAutoBids = await prisma.autoBid.findMany({
  where: { auctionId, isActive: true, maxAmount: { gte: newPrice } },
  orderBy: [{ maxAmount: 'desc' }, { createdAt: 'asc' }]
});
```

**Auto-bid on Dutch:** An auto-bid's `maxAmount` is an acceptance threshold. If the current price drops to or below a user's `maxAmount`, the system automatically accepts on their behalf. The highest `maxAmount` wins the tie (first to set gets priority on equal maxAmount).

**The price-first update is intentional:** The price is updated in Postgres before `placeBid` is called. This way, `placeBid`'s amount-must-equal-currentPrice check sees the updated price.

### Phase 3: Manual Accept

A user manually accepts the current price:

```
POST /api/bids/auctions/:id  { amount: 62000 }
```

In `placeBid` for Dutch:
```typescript
if (!amountD.eq(auction.currentPrice)) {
  throw createError(`Dutch auction bid must be exactly ${auction.currentPrice}`, 400);
}
// Call settleWithinTx(DIRECT_SALE) immediately
// End the auction
```

The Dutch auction ends on the first accept. No second bidder.

### Phase 4: Cancellation

If a Dutch auction is cancelled:
```typescript
await dutchAuctionQueue.removeRepeatable('drop-price', { jobId: auctionId });
```

Without this removal, the ghost `drop-price` job keeps firing on a CANCELLED auction. The worker's `if (!auction || auction.status !== AuctionStatus.ACTIVE) return;` guard prevents harm, but the job is wasted Redis + Postgres load.

---

## Sealed-Bid Auction Lifecycle

### Phase 1: Creation and Bidding

The sealed-bid auction runs like an English auction but with full privacy:
- `getAuctionBids` returns `amount: null, bidder: null` for all bids during ACTIVE status
- `auction.currentPrice` is NOT updated when bids arrive (would leak "someone bid above this")
- The fraud engine still scores bids (it sees the amount, but does not surface it publicly)

### Phase 2: The Commit Phase (Optional but Correct)

For auctions that use the cryptographic protocol:

```
POST /api/bids/auctions/:id/commit  { commitHash: "sha256hex" }
```

This creates a `BidCommitment` row. The actual bid amount is not stored yet — only the hash.

Bidders can update their commitment (upsert). This is intentional: a bidder might change their mind and re-commit a different amount+nonce. Since the server never sees the amount during this phase, re-committing reveals nothing.

### Phase 3: Auction Ends

`endAuction` runs for a sealed-bid auction:

**Before Phase E7 (broken):**
```
Transaction A: set auction.status = ENDED
(crash here)
Transaction B: refund loser bids
```
If crash between A and B: losers' holds stuck forever.

**After Phase E7:**
```typescript
await prisma.$transaction(async tx => {
  // Lock auction
  // Set status = ENDED
  
  // Refund all non-winning bids (WHERE refundedAt IS NULL)
  const loserBids = await tx.bid.findMany({
    where: { auctionId, status: 'ACTIVE', refundedAt: null }
  });
  
  // Lock all loser wallets in ascending userId order
  const loserIds = [...new Set(loserBids.map(b => b.bidderId))].sort();
  for (const uid of loserIds) {
    await tx.$queryRaw`SELECT id FROM wallets WHERE "userId" = ${uid} FOR UPDATE`;
  }
  
  for (const bid of loserBids) {
    await tx.wallet.update({
      where: { userId: bid.bidderId },
      data: {
        balance: { increment: bid.amount },
        heldAmount: { decrement: bid.amount },
      }
    });
    await tx.transaction.create({ data: { type: 'BID_RELEASE', amount: bid.amount, ... } });
    
    // Mark as refunded (idempotency key)
    await tx.bid.update({
      where: { id: bid.id },
      data: { refundedAt: new Date() }
    });
  }
  
  // Determine winner: the bid with the highest amount (all revealed or assumed max)
  // Set winner bid to WON
  // Set auction.winnerId, winnerBidId
  // Settle with settleWithinTx(WON_AUCTION)
});
```

The `WHERE refundedAt IS NULL` filter is the idempotency key: if the worker crashes and retries, bids that were already refunded in the previous partial run are skipped. No double-refund.

### Phase 4: Reveal Phase

After ENDED, bidders can reveal:
```
POST /api/bids/auctions/:id/reveal  { amount: 50000, nonce: "abc123def..." }
```

```typescript
const stored = await prisma.bidCommitment.findUnique(...);
const computed = SHA256(`${amountCents.toString(16)}:${nonce}`);
const isValid = computed === stored.commitHash;

await prisma.bidCommitment.update({
  where: { id: stored.id },
  data: { revealedAmount: amount, revealedNonce: nonce, revealedAt: new Date(), isValid }
});
```

`GET /api/bids/auctions/:id/commitments` returns all commitments — only available after ENDED, showing the full reveal history.

### Edge Cases for Sealed-Bid

**Bidder commits but never reveals:** The bid is scored at face value from the original bid amount (placed during the ACTIVE phase). The commitment is supplementary — the bid exists regardless. The unrevealed commitment is logged as `isValid: null` (neither confirmed nor denied).

**Bidder reveals with wrong nonce/amount:** `isValid = false`. The commitment was tampered with. This is logged in the BidCommitment row. The admin can see it in the commitments list.

**Multiple commits by the same bidder:** The `@@unique([auctionId, bidderId])` constraint means `commitBid` uses `upsert`. Only the last commitment counts.

---

## Cross-Type Edge Cases

### What Happens if the Server Crashes Between Enqueueing `end-auction` and Auction End?

BullMQ uses Redis as durable storage. The job is in the queue regardless of process state. When the server restarts, BullMQ reloads all pending jobs from Redis. The `end-auction` job will fire at its scheduled time, even if the server was down for 2 hours.

### What Happens if Two `end-auction` Jobs Run Simultaneously?

This should not happen (one delay-job per auction). But if it did (e.g., a BullMQ bug or manual re-queue), the `status !== 'ACTIVE'` check under the `FOR UPDATE` lock handles it: the second job sees `status = ENDED` and returns without touching anything.

### What Happens if Redis Goes Down?

The backend boots even if Redis is down (the Redis bootstrap is wrapped in try-catch). However:
- BullMQ cannot enqueue or process jobs → scheduled auctions will not start/end on time
- Socket.io falls back to in-memory adapter → no cross-instance broadcast
- User cache invalidation via pub/sub will not work

This is acceptable for a college demo. Production would require Redis HA (Redis Sentinel or Redis Cluster).

---

## The Auction State Machine

```
PENDING ──(startTime reached)──────────────────────────────► ACTIVE
   │                                                             │
   │                                              ┌─────────────┤
   │                                              │             │
   │                               (endTime reached │     (buy-now / manual accept)
   │                                OR price=0  │
   │                                OR reserve)   ▼             ▼
   ▼                                           ENDED         ENDED
CANCELLED ◄─────────(admin or seller cancels from PENDING or ACTIVE)
```

Every state transition is guarded:
- `PENDING → ACTIVE`: only by the `start-auction` BullMQ job
- `ACTIVE → ENDED`: by `end-auction` job OR `buyNow` OR Dutch price-drop to reserve
- `* → CANCELLED`: by admin or seller via `cancelAuction`
- No transition back to PENDING or ACTIVE from ENDED/CANCELLED

---

## Next Chapter

Chapter 26 covers the error handling, security, and middleware stack — AppError, createError, Zod error formatting, rate limiting, Helmet headers, JWT details.
