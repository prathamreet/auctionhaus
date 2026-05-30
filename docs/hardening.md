# AuctionHaus — Phase A Hardening Report

> **Acceptance criterion (plan.md §9):** verifiable via grep + this file.
> Every claim in this document maps to a specific file and line in the codebase.

---

## A1 — Decimal Money (2026-05-28)

**Problem:** All money fields were `Float` in Prisma. JavaScript IEEE-754
doubles cannot represent 0.1 + 0.2 exactly; accumulated bid-hold/release
operations would drift.

**Fix:**
- Every money column converted to `Decimal @db.Decimal(18,2)` in
  `back/prisma/schema.prisma` (Wallet.balance, Wallet.heldAmount, Transaction.amount,
  Auction.{startingPrice,reservePrice,currentPrice,buyNowPrice,dutchPriceStep,minIncrement},
  Bid.amount, AutoBid.{maxAmount,currentBid}).
- Migration: `back/prisma/migrations/20260528000000_decimal_money/migration.sql`
  (ALTER COLUMN … TYPE NUMERIC(18,2)).
- `back/src/lib/decimal.ts` exports `D()`, `toNum()`, `neg()`, `serializeMoney()`.
  All arithmetic across bid/wallet/auction/payment/auto-bid/workers uses Decimal methods.
- API surface preserved as `number`: every service function returns `toNum(x)` at
  its boundary so the frontend's `amount: number` types keep working with zero churn.

**Verify:**
```bash
grep -E "^\s+(balance|amount|currentPrice|startingPrice)\s+Float" back/prisma/schema.prisma
# → 0 matches
```

---

## A2 — Row Locks (2026-05-28)

**Problem:** `placeBid`, `withdraw`, `buyNow`, `endAuction`,
`confirmWinnerPayment` all read-then-write without holding a Postgres row lock.
Two concurrent requests could both pass the validation check and both commit,
producing duplicate winning bids or double-withdrawals.

**Fix:** `SELECT ... FOR UPDATE` inside `prisma.$transaction` in:
- `bid.service.placeBid` (auction row + both wallet rows)
- `wallet.service.withdraw` (wallet row)
- `auction.service.buyNow` (auction row + wallet rows)
- `workers/index.ts::endAuction` (auction row — idempotent under BullMQ re-delivery)
- `payment.service.confirmWinnerPayment` (auction + wallet rows)

**Global lock order:** auction first, then wallets in ascending `userId` to
prevent deadlocks. Every code path follows this order.

**Verify:**
```bash
grep -n "FOR UPDATE" back/src/modules/bidding/bid.service.ts back/src/modules/wallet/wallet.service.ts back/src/modules/auctions/auction.service.ts back/src/workers/index.ts back/src/modules/payments/payment.service.ts
# → ≥ 5 hits across the files
```

---

## A3 — Indexes (2026-05-28)

**Problem:** No composite indexes on hot query paths. Every catalogue page load
and bid history fetch was a sequential scan.

**Fix:** `back/prisma/migrations/20260528000001_perf_indexes/migration.sql`:
- B-tree: `Auction(status)`, `Auction(endTime)`, `Auction(type, status)`
- B-tree: `Bid(auctionId, status)`, `Bid(bidderId)`
- B-tree: `Notification(userId, isRead)`, `Transaction(userId, createdAt)`
- GIN: `to_tsvector('english', title || ' ' || description)` for full-text search

`getAuctions` search switched from ILIKE to Postgres FTS
(`to_tsquery` with `:*` prefix operator) — session 2026-05-29.

**Verify:**
```bash
grep "CREATE INDEX\|GIN" back/prisma/migrations/20260528000001_perf_indexes/migration.sql
# → 8+ index creation statements
```

---

## A4 — Sealed-Bid Privacy (2026-05-28)

**Problem:** `getAuctionBids` used `select: { name: false }` which is a no-op
in Prisma, leaking bidder identities. `placeBid` still updated `currentPrice`
for sealed auctions, exposing the latest bid amount.

**Fix:**
- `bid.service.getAuctionBids`: while sealed+ACTIVE, returns `amount: null` and
  `bidder: null` for all non-viewer bids; ordered by `createdAt` (not amount).
- `bid.service.placeBid`: skips `currentPrice` update for `SEALED_BID`.
- `bid.controller.placeBid`: redacts `bid:new` socket payload (omits amount +
  bidderId, adds `sealed: true`).
- `auction.service.getAuctionById`: filters embedded `bids[]` to viewer's own.

**Verify:**
```bash
grep -n "SEALED_BID\|isSealedLive\|sealed: true" back/src/modules/bidding/bid.service.ts back/src/modules/bidding/bid.controller.ts
```

---

## A5 — EscrowService (2026-05-29)

**Problem:** Payout logic duplicated across `buyNow`, `confirmWinnerPayment`,
and the worker. Each could independently move money, risking double-settlement
on BullMQ re-delivery or concurrent calls.

**Fix:** `back/src/modules/escrow/escrow.service.ts` exports
`settleWithinTx(tx, {...})` — the single buyer→seller settlement path. Runs
inside the caller's locked transaction. Idempotent via a `Settlement` row
(`auctionId @unique`): a retried call finds the row and returns
`{ alreadySettled: true }` without moving money.

Two settlement kinds:
- `DIRECT_SALE` (buyNow): debits payer.balance, credits seller.balance.
- `WON_AUCTION` (confirmWinnerPayment): releases payer.heldAmount (already held
  at bid time), credits seller.balance.

**Verify:**
```bash
grep -rn "settleWithinTx\|Settlement" back/src/modules/escrow/escrow.service.ts back/src/modules/auctions/auction.service.ts back/src/modules/payments/payment.service.ts
```

---

## A6 — Auto-Bid Ladder via Queue (2026-05-28)

**Problem:** `processAutoBids` called `placeBid` recursively inside a nested
`prisma.$transaction`, which Prisma does not support (flattens or deadlocks).
It also skipped intermediate steps (jumping to `min(beatingAmount, maxAmount)`)
violating the UX contract that every increment shows in the bid log.

**Fix:**
- Old `processAutoBids` deleted entirely.
- New `autoBidQueue` (BullMQ) in `queues/auction.queue.ts`.
- `bid.service.placeBid` enqueues `{ auctionId, triggerBidderId }` *after* its
  own tx commits (no phantom jobs from rolled-back bids).
- `workers/index.ts::processAutoBidLadder` runs in one `prisma.$transaction`,
  locked, with one step per iteration: writes a `Bid` row at exactly
  `currentPrice + minIncrement` each time, bounded by
  `(highestMax − cur) / inc + 2`.

**Verify:**
```bash
grep -n "process-ladder\|autoBidQueue" back/src/workers/index.ts back/src/modules/bidding/bid.service.ts
# → producer in bid.service, worker in workers/index
```

---

## A7 — Async Notifications (2026-05-28)

**Problem:** `notifyUser` calls were `await`-ed inside bid transactions,
adding a DB write to the critical path.

**Fix:** `notification.service.ts::notifyUser` now calls
`notificationQueue.add('deliver', {...})`. A worker writes to DB then emits
socket — outside the bid transaction.

---

## A8 — Socket.io Redis Adapter (2026-05-28)

**Problem:** `redisPub` and `redisSub` were allocated in `lib/redis.ts` but
imported nowhere — dead connections. The Socket.io server had no cross-instance
fan-out.

**Fix:** `io.adapter(createAdapter(redisPub, redisSub))` inside the Redis-up
try-block in `index.ts`. Falls back to in-memory adapter if Redis is down.

---

## A9 / A9.x — Auth Cache + Cross-Instance Invalidation (2026-05-28/29)

**Problem:** Every authenticated request hit Postgres for `user.findUnique`.

**Fix A9:** `auth.middleware.ts` — `Map<userId, {user, expiresAt}>` with 30s
TTL. Cache evicted immediately by `admin.service.suspendUser`.

**Fix A9.x:** On suspension, `admin.service` publishes the `userId` to Redis
channel `user:invalidate`. `index.ts` subscribes via a dedicated
`redisInvalidateSub` connection and calls `invalidateUser(userId)` on every
instance. Suspended accounts are blocked cluster-wide within milliseconds.

---

## A10/A11 — Documentation Truth (2026-05-29)

- `xdocs/archive/` holds the aspirational docs (`bible.md`, `done.md`,
  `back-learn.md`) behind a `README.md` explaining the known drift.
- `plan.md` is the single source of truth.
- `back/src/scripts/generate-docs.ts` + `npm run docs:generate` produces
  `docs/api.md` and `docs/schema.md` from live code (Prisma DSL + TS AST,
  no app boot).

---

## Summary Table

| Phase | Feature | File(s) | Status |
|-------|---------|---------|--------|
| A1 | Decimal money | `schema.prisma`, `lib/decimal.ts`, all services | ✓ |
| A2 | Row locks | `bid.service`, `wallet.service`, `auction.service`, `workers`, `payment.service` | ✓ |
| A3 | DB indexes + FTS | migrations `000001`, `auction.service.getAuctions` | ✓ |
| A4 | Sealed-bid privacy | `bid.service`, `bid.controller`, `auction.service` | ✓ |
| A5 | EscrowService | `escrow/escrow.service.ts`, Settlement model | ✓ |
| A6 | Auto-bid queue | `autoBidQueue`, `workers/processAutoBidLadder` | ✓ |
| A7 | Async notifications | `notification.service`, `notificationQueue` | ✓ |
| A8 | Socket.io adapter | `index.ts`, `lib/redis.ts` (redisPub/Sub) | ✓ |
| A9/A9.x | Auth cache + pub/sub invalidation | `auth.middleware`, `admin.service`, `index.ts` | ✓ |
| A10/A11 | Doc truth + code-derived docs | `xdocs/archive/`, `scripts/generate-docs.ts` | ✓ |
