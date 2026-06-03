# Chapter 6 — Low-Level Design: Every Module Explained

## How to Read This Chapter

Each section covers one module: what it owns, what its key functions do, and any important implementation detail worth knowing. This is the reference chapter — you would read this when you need to understand a specific piece of the system in depth.

---

## Auth Module (`modules/auth/`)

**Responsibility:** Register, login, and fetch the current user.

### `auth.service.ts`

**`register(email, password, name)`:**
1. Check `prisma.user.findUnique({ where: { email } })` — reject if already exists (409)
2. Hash password: `bcrypt.hash(password, 10)`
3. `prisma.user.create(...)` — creates User + Wallet in one transaction
4. Return user object (without password)

**`login(email, password)`:**
1. Find user by email
2. `bcrypt.compare(plainPassword, user.password)` — reject if no match (401)
3. Check `isSuspended` — reject if suspended (403)
4. Generate JWT: `jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '7d' })`
5. Return `{ user, token }`

**`getMe(userId)`:** Returns the user plus wallet. Used by `/api/auth/me` — the first call the frontend makes after loading to re-hydrate the auth store.

### JWT Details

The token is signed with HMAC-SHA256 (HS256). Payload: `{ id, email, role }`. Expiry: 7 days. The secret is read from `JWT_SECRET` environment variable.

The frontend stores the token in `localStorage`. The `ah_logged_in=1` cookie (HttpOnly-safe, not the token itself) lets the Next.js middleware redirect without reading localStorage.

---

## Users Module (`modules/users/`)

**Responsibility:** User profiles, bid history, user ratings.

**`getUserProfile(userId)`:** Returns public profile info — name, avatar, rating, auctions created, wins. Does not expose password or wallet.

**`updateProfile(userId, data)`:** Updates name/avatar. Simple update.

**`getBidHistory(userId)`:** Returns all bids by this user, with auction details.

**`rateUser(raterId, rateeId, auctionId, score, comment)`:**
1. Check that the auction has ended
2. Check that one of the two users is the winner (you can only rate your transaction partner)
3. `@@unique([raterId, rateeId, auctionId])` prevents double ratings
4. Create Rating row
5. Update `ratee.rating = (rating * ratingCount + score) / (ratingCount + 1)` — rolling average update

---

## Auctions Module (`modules/auctions/`)

**Responsibility:** CRUD for auctions, buyNow, cancel, full-text search.

### `createAuction(sellerId, data)`

1. Validates start < end time
2. Dutch auctions require `dutchPriceStep` + `dutchInterval`
3. Creates Auction row with `status = ACTIVE` if `startTime <= now`, else `PENDING`
4. Schedules BullMQ `start-auction` and `end-auction` jobs with delays

### `getAuctions(filters)`

The search filter uses PostgreSQL full-text search:
```sql
SELECT id FROM auctions 
WHERE to_tsvector('english', title || ' ' || description) 
   @@ to_tsquery('english', 'term1:* & term2:*')
```
The `:*` operator means prefix match — "rol" matches "rolex". The result IDs feed back into `prisma.findMany` with the other filters (status, type, pagination). Injection-safe because the query text is parameterised.

### `getAuctionById(id, viewerId?)`

For sealed-bid auctions in ACTIVE status: filters `bids[]` to only the viewer's own bid. Other bidders' bids are hidden entirely.

### `buyNow(auctionId, buyerId)`

1. Opens `prisma.$transaction`
2. `SELECT ... FOR UPDATE` on the auction row
3. Validates: ACTIVE, ENGLISH type, buyNowPrice exists, buyer != seller
4. Locks wallets in ascending userId order
5. Calls `settleWithinTx(tx, { kind: DIRECT_SALE, ... })` — the idempotent escrow settlement
6. Sets auction to ENDED, sets winnerId

### `cancelAuction(auctionId, userId)`

1. Validates: auction is PENDING or ACTIVE, caller is seller or admin
2. If ACTIVE: refunds all bid holds for all bidders (in a loop — one wallet update per bidder; could be batched but acceptable for current scale)
3. Sets status to CANCELLED
4. Cancels Dutch recurring job if applicable

---

## Bidding Module (`modules/bidding/`)

**Responsibility:** Place a bid, get bids for an auction, the Redis Stream sequencer.

### `placeBid(auctionId, bidderId, amount)`

This is the most critical function in the entire system. Every detail matters.

```
1. Open prisma.$transaction(async tx => {

2. Lock auction: 
   SELECT * FROM auctions WHERE id = ? FOR UPDATE

3. Validate:
   - auction.status === ACTIVE
   - auction.type !== SEALED_BID (sealed bids use commitment service)
   - amount >= auction.currentPrice + auction.minIncrement   (for ENGLISH)
   - amount === auction.currentPrice                         (for DUTCH)
   - caller is not the seller

4. For DUTCH: call settleWithinTx(DIRECT_SALE) and end the auction here.
   Return early.

5. For ENGLISH:
   a. Lock wallets: SELECT FOR UPDATE on buyer + previous winner, 
      ordered by userId ASC (deadlock prevention)
   b. Check buyer wallet: balance - heldAmount >= amount
   c. Find current WINNING bid, set it to OUTBID
   d. Release previous winner's hold:
      wallet.heldAmount -= prev amount
      wallet.balance += prev amount
      Transaction(BID_RELEASE)
   e. Create new Bid row (WINNING)
   f. Hold new winner's amount:
      wallet.balance -= amount
      wallet.heldAmount += amount
      Transaction(BID_HOLD)
   g. Update auction.currentPrice = amount
   h. Anti-snipe check: if endTime - now < antiSnipingMins * 60000
      auction.endTime += antiSnipingMins * 60 * 1000

6. }) -- transaction commits

7. After tx:
   - autoBidQueue.add('process-ladder', { auctionId, triggerBidderId })
   - notifyUser(previous winner: OUTBID notification)
   - FraudEngine.observe(bidEvent)   -- fire-and-forget
   - io.to(`auction:${auctionId}`).emit('bid:new', ...)
```

The global lock order (auction first, then wallets sorted by userId ascending) is the deadlock prevention invariant. It is enforced consistently across `placeBid`, `withdraw`, `buyNow`, `endAuction`, and `settleWithinTx`. As long as every code path locks in the same order, two transactions can never form a cycle.

### `getAuctionBids(auctionId, isSealed, viewerId)`

For sealed+ACTIVE: returns bids with `amount: null`, `bidder: null` (not just hidden, actually null), ordered by `createdAt ASC` (not by amount — sorting by amount would reveal relative sizes).

For everything else: full bid details ordered by amount descending.

### `BidSequencer` (bid.sequencer.ts)

The sequencer is an opt-in alternative to direct `placeBid`. Activated with `BID_SEQUENCER=true` env variable.

**Enqueue path:**
```
POST /api/bids/auctions/:id/stream
→ BidSequencer.enqueue(auctionId, bidderId, amount)
→ checks XLEN(auction:{id}:bids) < BACKPRESSURE_THRESHOLD
→ XADD auction:{id}:bids * { bidderId, amount, ts }
```

**Consumer path (startConsumer):**
```
XREADGROUP GROUP bid-processors consumer1 COUNT 1 BLOCK 1000 STREAMS auction:{id}:bids >
→ for each entry: calls placeBid(auctionId, bidderId, amount)
→ XACK auction:{id}:bids bid-processors <entryId>
```

The consumer processes one bid at a time per stream. This is the serial-per-auction guarantee that eliminates lock contention: instead of 100 concurrent transactions fighting for the auction row lock, they queue in the stream and process one by one. Chapter 10 covers this in full.

---

## Auto-Bid Module (`modules/auto-bid/`)

**Responsibility:** Set, cancel, and query auto-bids.

### `setAutoBid(bidderId, auctionId, maxAmount)`

1. Validates: auction is ACTIVE, English type, caller is not the seller
2. **Phase E2 check:** `wallet.balance - wallet.heldAmount >= maxAmount`. Fail fast — "Need ₹X, have ₹Y available"
3. Upserts: `prisma.autoBid.upsert({ where: { auctionId_bidderId: ... }, ... })`

### Auto-Bid Ladder (in workers/index.ts, processAutoBidLadder)

This is called by the BullMQ worker, not from the module directly. The full algorithm:

```
1. Open prisma.$transaction(async tx => {
2. Lock auction: SELECT ... FOR UPDATE
3. Validate: auction is ACTIVE and not expired (endTime guard)
4. Load pool: all ACTIVE auto-bids for this auction 
   EXCLUDING the manual bidder who triggered it
   ORDER BY maxAmount DESC, createdAt ASC
   (highest max wins ties; earlier registration wins ties on equal max)

5. Identify the current winner (the triggering manual bidder)

6. Loop while pool has entries:
   challenger = pool[0]
   nextPrice = auction.currentPrice + auction.minIncrement
   
   if nextPrice > challenger.maxAmount:
     challenger.isActive = false  -- exhausted
     pool.shift()
     continue
   
   // Make the next bid
   Lock wallets: current winner + challenger, sorted by userId ASC
   Check challenger wallet.balance - wallet.heldAmount >= nextPrice
   If insufficient: challenger.isActive = false; pool.shift(); continue
   
   Release previous winner's hold
   Create Bid row for challenger (WINNING)
   Hold challenger's amount
   Update auction.currentPrice = nextPrice
   Update challenger.currentBid = nextPrice
   
   // Now challenger is winner; old winner might still have funds
   // Check if old winner's auto-bid can counter
   old winner becomes the pool target...
   // The loop continues until no auto-bid can raise the price further
   
   Bound: loop runs at most (highestMax - startPrice) / minIncrement + 2 times

7. }) -- transaction commits

8. Emit bid:ladder event with all steps
```

This entire ladder runs in ONE transaction. All bid rows for all steps are written atomically. If the process crashes midway, Postgres rolls back and nothing is partially committed.

---

## Wallet Module (`modules/wallet/`)

**Responsibility:** Deposit and withdraw.

### `deposit(userId, amount)`

Simple: `prisma.wallet.update({ where: { userId }, data: { balance: { increment: amount } } })`. Also creates a Transaction(DEPOSIT) row.

### `withdraw(userId, amount)`

Uses a pessimistic lock:
```
prisma.$transaction(async tx => {
  wallet = SELECT * FROM wallets WHERE userId=? FOR UPDATE
  available = wallet.balance - wallet.heldAmount
  if available < amount: throw 400
  wallet.balance -= amount
  Transaction(WITHDRAWAL)
})
```

The `FOR UPDATE` ensures two concurrent withdrawals cannot both read the same available balance.

---

## Escrow Module (`modules/escrow/`)

**Responsibility:** The single, idempotent settlement function.

### `settleWithinTx(tx, { auctionId, auctionTitle, payerId, sellerId, amount, kind })`

Called by `buyNow` and `endAuction`. Must be called inside an existing transaction where the auction is already locked.

```
1. Check settlements table: SELECT * FROM settlements WHERE auctionId=?
   If found: return { alreadySettled: true }

2. Lock wallets: SELECT FOR UPDATE on payer + seller, sorted by userId ASC

3. By kind:
   DIRECT_SALE:
     - check payer.balance >= amount
     - payer.balance -= amount
     - seller.balance += amount
     - Transaction(PAYMENT) for payer (debit)
     - Transaction(PAYMENT) for seller (credit)
   WON_AUCTION:
     - payer.heldAmount -= amount  (funds were held at bid time)
     - seller.balance += amount
     - Transaction(PAYMENT) for winner (release held)
     - Transaction(PAYMENT) for seller (credit)

4. INSERT INTO settlements (auctionId, ...)
   (unique constraint on auctionId — a second call gets a conflict and no-ops)
```

The Settlement row is the idempotency guard. No two calls can insert the same auctionId. This means `buyNow` and `confirmWinnerPayment` (the backstop) can race without double-paying.

---

## Notifications Module (`modules/notifications/`)

**Responsibility:** Enqueue notification delivery.

`notifyUser(userId, { type, title, message, data })` just calls:
```
notificationQueue.add('deliver', { userId, type, title, message, data })
```

The worker writes to the database and emits the socket event. This keeps the bid transaction clean — notification DB write is not in the critical path.

---

## Fraud Module (`modules/fraud/`)

**Responsibility:** Everything related to real-time fraud detection. Three files.

### `fraud.graph.ts` — BidGraph

A sliding-window in-memory graph. Nodes: bidders (User IDs) and auctions. Edges: bids, tagged with amount and timestamp.

Key data structures:
```typescript
// Per-auction: Map<bidderId, BidEvent[]>
auctionBids: Map<auctionId, Map<bidderId, BidEvent[]>>

// Per-bidder across all auctions: Map<bidderId, BidEvent[]>
bidderBids: Map<bidderId, BidEvent[]>

// Per-bidder+seller: Map<bidderId, Set<sellerId>>
bidderSellerMap: Map<bidderId, Map<sellerId, number>>
```

Lazy pruning: entries older than `windowMs` (30 min) are removed when new entries are inserted, not on a timer. This means no background thread, no GC pressure spike — old data just disappears naturally when space is needed.

`reciprocity()`: For a given auction, checks what fraction of all bidder pairs have outbid each other mutually. Expensive in theory (O(pairs)) but bounded by the small number of distinct bidders in a single auction.

### `fraud.features.ts` — Feature Extraction

`extractFeatures(event, graph)` computes all five features:

- **F1 responseTimeMs**: `event.ts - graph.lastBidTimestamp(auctionId)`. Zero if this is the opening bid.
- **F2 bidFrequencyPerMin**: `count(bidder bids in window) / windowMinutes`
- **F3 incrementRatio**: `event.amount / auction.minIncrement`
- **F4 sellerCoOccurrence**: `count(distinct sellers this bidder has bid with in window)`
- **F5 reciprocityScore**: `graph.reciprocity(auctionId)`

### `fraud.classifier.ts` — Logistic Regression

The weights and normalization parameters are constants in the file, generated by the training pipeline. The `score(features)` function:

1. Z-score normalize each feature: `(value - mean) / std`, clamped to [-4, 4]
2. Compute logit: `intercept + w1*z1 + w2*z2 + w3*z3 + w4*z4 + w5*z5`
3. Return `sigmoid(logit)` — a probability in [0, 1]

The `explain(features, score)` function produces a human-readable reason string for the admin dashboard.

---

## Commitments Module (`modules/commitments/`)

**Responsibility:** SHA-256 sealed-bid commit-reveal.

### `commitBid(auctionId, bidderId, commitHash)`

1. Validates: auction is ACTIVE + SEALED_BID type
2. `prisma.bidCommitment.upsert(...)` — updates the hash if the bidder re-commits

### `revealBid(auctionId, bidderId, amount, nonce)`

1. Validates: auction has ENDED
2. Recomputes hash: `SHA-256(amount.toString(16) + ":" + nonce)`
3. Compares with stored `commitHash`
4. Stores `revealedAmount`, `revealedNonce`, `isValid`

### `hashCommitment(amountCents, nonce)`

The hash function: `SHA-256(amountCents.toString(16) + ":" + nonce)`. The amount is in cents (integers) to avoid floating point inconsistencies in the hash input.

---

## Admin Module (`modules/admin/`)

**Responsibility:** Platform statistics, user management, auction moderation, fraud flag management.

- `getDashboardStats()`: Counts users, auctions (by status), bids, recent signups. Uses `prisma.$transaction([prisma.user.count(), ...])` for parallel queries.
- `suspendUser(userId)`: Sets `isSuspended = true` + publishes to `user:invalidate` Redis channel + local cache evict.
- `moderateAuction(auctionId, action)`: Can cancel any auction.
- `getFraudFlags(dismissed?, limit)`: Returns recent fraud flags for the admin dashboard.
- `dismissFlag(flagId)`: Marks a flag as reviewed.

---

## Next Chapter

Chapter 7 is the most important technical chapter: concurrency and money. It explains in depth why floating point is wrong, how race conditions form and how we closed them, the global lock-order invariant, and the EscrowService's idempotency.
