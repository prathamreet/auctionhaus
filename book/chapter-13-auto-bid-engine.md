# Chapter 9 — The Auto-Bid Engine

## What Is Proxy Bidding?

Imagine you are bidding on a watch you want for up to ₹50,000. You could sit in front of the auction page and manually increment your bid every time someone outbids you. Or you could set a proxy bid: "bid on my behalf up to ₹50,000, incrementing the minimum each time." The system does the bidding for you.

Proxy bidding has been a standard feature of eBay since the late 1990s. It is also called "automatic bidding" or "max bidding." Conceptually simple; surprisingly hard to implement correctly.

---

## The Three Implementation Approaches

When building a proxy bidding system, you have three main options:

### Option 1: Closed-Form Jump

When someone outbids you, compute in one step: "the winning price will be `min(my_max, opponent_max + minIncrement)`" and create one bid at that final price.

**Problem:** The bid log shows only the final price, not the intermediate steps. If the price jumps from ₹10,000 to ₹45,100, the log shows one entry. This hides the evidence that would let the fraud detector notice "this bidder responded in 142ms." The bid graph cannot compute response times, bid frequencies, or reciprocity patterns without per-step records.

### Option 2: Recursive Resolution

When a manual bid arrives, call `processAutoBids()` inside the bid transaction. Inside, call `placeBid()` for each auto-bid increment. `placeBid()` opens its own transaction. Continue until equilibrium.

**Problems:**
- Prisma does not support nested interactive transactions. The inner `prisma.$transaction` runs within the outer one but does not have its own isolation — it sees uncommitted data from the outer transaction.
- If the outer transaction rolls back, the inner bids (if they somehow committed separately) create orphaned records.
- Under concurrent load with multiple auto-bidders, two outer transactions can each try to create inner transactions that need each other's locks. Classic deadlock.
- Using `setImmediate()` to escape the transaction makes it a fire-and-forget: if the process crashes, no retry.

### Option 3: Atomic Ladder Protocol (What AuctionHaus Does)

Enqueue a BullMQ job after the manual bid commits. A dedicated worker processes the job in a single, fresh transaction that runs the entire ladder atomically.

**Benefits:**
- Every increment is a separate Bid row (per-increment logging)
- One transaction = atomic (all or nothing)
- BullMQ provides at-least-once retry if the worker crashes
- The worker runs serially (concurrency = 1 per auction via lock, not queue concurrency) — no race within the ladder
- The transaction is isolated from other concurrent bids (the auction row is locked at the start)

---

## The Protocol in Detail

### Trigger

After `placeBid` commits the manual bid:

```typescript
// bid.service.ts, after tx.commit
await autoBidQueue.add('process-ladder', { auctionId, triggerBidderId });
```

The trigger is enqueued after commit (not inside the transaction). This prevents a phantom enqueue: if the manual bid transaction rolls back (e.g., insufficient balance), no ladder job is created.

### The Ladder Worker

```typescript
// workers/index.ts, autoBidWorker
async function processAutoBidLadder(auctionId: string) {
  await prisma.$transaction(async tx => {
    
    // Step 1: Lock the auction row
    const [auction] = await tx.$queryRaw`
      SELECT * FROM auctions WHERE id = ${auctionId} FOR UPDATE
    `;
    
    // Step 2: Validate
    if (!auction || auction.status !== 'ACTIVE') return;
    if (Date.now() > auction.endTime.getTime()) return;  // Phase E4: endTime guard
    if (auction.type !== 'ENGLISH') return;
    
    // Step 3: Load the auto-bid pool
    // All active auto-bids EXCEPT the manual bidder who triggered this
    const pool = await tx.autoBid.findMany({
      where: { auctionId, isActive: true, NOT: { bidderId: triggerBidderId } },
      orderBy: [
        { maxAmount: 'desc' },   // highest max first
        { createdAt: 'asc' }     // earlier registration breaks ties (Phase E3)
      ]
    });
    
    // Step 4: Identify current winner (the manual bidder)
    let currentWinnerId = triggerBidderId;
    let currentPrice = auction.currentPrice;
    
    // Step 5: The loop
    const maxIterations = pool[0] 
      ? (pool[0].maxAmount - currentPrice) / auction.minIncrement + 2 
      : 0;
    
    let iterations = 0;
    while (pool.length > 0 && iterations < maxIterations) {
      iterations++;
      const challenger = pool[0];
      const nextPrice = D(currentPrice).add(D(auction.minIncrement));
      
      // Can challenger raise to this price?
      if (D(challenger.maxAmount).lt(nextPrice)) {
        challenger.isActive = false;  // exhausted
        await tx.autoBid.update({ where: { id: challenger.id }, data: { isActive: false } });
        pool.shift();
        continue;
      }
      
      // Lock wallets: current winner + challenger, sorted by userId ASC
      const walletIds = [currentWinnerId, challenger.bidderId].sort();
      const wallets = await tx.$queryRaw`
        SELECT * FROM wallets WHERE userId = ANY(${walletIds}) FOR UPDATE
      `;
      const challengerWallet = wallets.find(w => w.userId === challenger.bidderId);
      
      // Can challenger afford it?
      const available = D(challengerWallet.balance).sub(D(challengerWallet.heldAmount));
      if (available.lt(nextPrice)) {
        await tx.autoBid.update({ where: { id: challenger.id }, data: { isActive: false } });
        pool.shift();
        continue;
      }
      
      // Create the bid
      const bid = await tx.bid.create({
        data: {
          auctionId,
          bidderId: challenger.bidderId,
          amount: nextPrice,
          status: 'WINNING',
          isAutoBid: true
        }
      });
      ladderSteps.push(bid);
      
      // Update wallet holds
      // Release previous winner's hold
      const winnerWallet = wallets.find(w => w.userId === currentWinnerId);
      await tx.wallet.update({ where: { id: winnerWallet.id }, data: {
        heldAmount: { decrement: currentPrice },
        balance:    { increment: currentPrice }
      }});
      await tx.transaction.create({ data: { /* BID_RELEASE */ } });
      
      // Hold challenger's amount
      await tx.wallet.update({ where: { id: challengerWallet.id }, data: {
        balance:    { decrement: nextPrice },
        heldAmount: { increment: nextPrice }
      }});
      await tx.transaction.create({ data: { /* BID_HOLD */ } });
      
      // Update auction price
      await tx.auction.update({ where: { id: auctionId }, data: { currentPrice: nextPrice } });
      
      // Update challenger's currentBid
      await tx.autoBid.update({ where: { id: challenger.id }, data: { currentBid: nextPrice } });
      
      // Now challenger is the winner; flip roles
      currentWinnerId = challenger.bidderId;
      currentPrice = nextPrice.toNumber();
      
      // Does the previous winner have an auto-bid that can counter?
      const counterAutoBid = pool.find(ab => ab.bidderId === /* prev winner */ ...);
      if (counterAutoBid && D(counterAutoBid.maxAmount).gte(D(nextPrice).add(D(auction.minIncrement)))) {
        // Put them back at the front of the pool
        pool.unshift(counterAutoBid);
        pool.splice(pool.indexOf(counterAutoBid, 1), 1);
      }
    }
    
    // Update previous winner's bid status to OUTBID
    // ... set all non-winning bids to OUTBID
    
  }); // transaction commits atomically
  
  // Emit bid:ladder (one event, not N bid:new events)
  io.to(`auction:${auctionId}`).emit('bid:ladder', {
    auctionId,
    steps: ladderSteps.map(serializeMoney),
    finalPrice: currentPrice,
    lastBidId: ladderSteps.at(-1)?.id,
    serverTs: Date.now()
  });
  
  // Per-step notifications
  for (const step of ladderSteps) { /* notify winner changed */ }
}
```

### The Bounding Argument

The loop runs at most `(highestMaxAmount - currentPrice) / minIncrement + 2` times. This is bounded because:

- Each iteration increments the price by at least `minIncrement`
- The loop stops when no auto-bid in the pool can reach the next price
- The pool shrinks by one (or the front bidder becomes the winner) each iteration

The `+ 2` gives a small safety margin for edge cases. A loop that cannot terminate would be a catastrophic bug in a financial system.

---

## The UX Contract

From the product's perspective, the auto-bid engine has one inviolable contract:

> When user X has auto-bid max=1000 and user Y has auto-bid max=11000, and a manual bid at ₹1,000 triggers the ladder, the bid log MUST show every increment: 1100, 1200, 1300, ..., up to where X's max is exceeded. No jumping from ₹1,000 to ₹11,100 in one step.

This contract exists for three reasons:

1. **Fraud detection**: The fraud engine reads response times from consecutive bids. Without per-increment logging, the features are computed from phantom data.

2. **User trust**: If the price jumps from ₹1,000 to ₹11,100 invisibly, the bidder who placed ₹1,000 sees their bid immediately outpriced without any narrative. The ladder log shows them exactly how it happened.

3. **Audit trails**: For any dispute about whether the price was reached fairly, the bid log provides a complete reconstruction.

---

## Phase E Enhancements

Several Phase E improvements made the auto-bid engine production-grade:

**E1 — Batched `bid:ladder` event**: Instead of emitting N `bid:new` events (one per step), emit one `bid:ladder` event carrying all steps. The frontend handles one event instead of N.

**E2 — Pre-flight affordability check**: `setAutoBid` now requires `balance - heldAmount >= maxAmount` at registration time. Users find out immediately if they cannot afford the max, rather than silently failing during the ladder later.

**E3 — Deterministic tie-break**: Pool is sorted by `maxAmount DESC, createdAt ASC`. Earlier-registered auto-bids win ties on equal `maxAmount`. This makes the ladder deterministic — given the same pool, it always produces the same result.

**E4 — End-time race guard**: `if (Date.now() > auction.endTime.getTime()) return;` at the start of the ladder. Closes the race where a BullMQ job is picked up after the `end-auction` job already ran. Without this, the ladder could run on an ENDED auction and create extra bids.

---

## The Second Research Paper: Atomic Ladder Protocol

The auto-bid engine is the subject of `paper/auto-bid-ladder.tex` — a second IEEE paper about the formal correctness of this protocol. It proves:

- **Theorem 1 (Log Fidelity)**: The ladder writes exactly one bid per increment, in order, with no gaps.
- **Theorem 2 (Vickrey Equivalence)**: The final price equals `min(highest_max, second_highest_max + minIncrement)`, which is the Vickrey equilibrium price for a proxy-bid English auction.
- **Theorem 3 (Deadlock Freedom)**: The two-tier lock ordering (auction first, wallets ascending) prevents any cycle in the wait-for graph.

The evaluation section of that paper benchmarks three implementations (closed-form jump, recursive nested transactions, and the atomic ladder) across three concurrency levels, measuring throughput, determinism (SHA-256 hash of bid log), and log fidelity. The atomic ladder is the only one that passes all three metrics under concurrent load.

---

## Next Chapter

Chapter 10 covers Redis in depth — its four different roles in AuctionHaus, how BullMQ uses it, the bid sequencer's Redis Streams, and the pub/sub channel for cross-instance cache invalidation.
