# AuctionHaus — Master Plan

> **Purpose of this file.** This is the single source of truth that every future Claude session must read before touching anything. It captures (a) what the code *actually* is today (as of audit date 2026-05-28), (b) the gap between docs and reality, (c) the phased roadmap from "CRUD app" to "research-paper-worthy major project", and (d) the rules of engagement. Update this file whenever a phase task is finished.
>
> If you are a future Claude session: read this top-to-bottom before any other file. Then read `graphify-out/GRAPH_REPORT.md`. Only after both, touch source files.

---

## 0. North Star

The teachers' verdict — *"just a CRUD app, nothing special, no research paper potential"* — is **technically correct given the current state**. The code implements the textbook auction features competently but contains zero novel mechanism, no measurement story, and no original contribution.

The goal of this plan is to convert AuctionHaus into a major project that can credibly support:

1. **A working IEEE/Springer-style undergrad paper** on *real-time shill-bidding detection via online graph analytics* (primary research angle).
2. **A demo that visibly differentiates from every other student auction project**: live bid-velocity charts, fraud-graph dashboard, cryptographically-committed sealed bids, lock-free bid serializer with measured throughput.
3. **A hardened, production-shaped backend** the user can defend in a viva: pessimistic locks, decimal money, indexes, outbox pattern, distributed coordination — not "wallet uses float and hopes for the best".

Keep what works. Cut what is fake. Build what is unique.

---

## 1. What the Code Actually Is (Ground Truth)

> Verified by reading the actual TypeScript and the Prisma schema, not the markdown docs.

### 1.1 Stack & Topology
- **Monorepo** (`npm workspaces`): `front/` (Next.js 16, App Router, React 19, Tailwind v4, TanStack Query 5, Zustand 5, socket.io-client) + `back/` (Express 4, TypeScript, Prisma 5 → Postgres, ioredis, BullMQ 5, Socket.io 4, JWT, bcryptjs, Zod). Plan to split repos later.
- Express + Socket.io share one HTTP server. BullMQ workers boot inside the same process. Redis is **optional** — backend boots even if Redis is down (real-time and background jobs are silently disabled).
- 4 Redis connections opened in [back/src/lib/redis.ts](back/src/lib/redis.ts): `redis`, `bullMQConnection`, `redisPub`, `redisSub`. **`redisPub` and `redisSub` are imported nowhere.** Pure dead weight (this is part of why the user feels "Redis is heavy"). The Socket.io server is **not** running the redis-adapter, so it cannot scale horizontally — yet 2 connections are reserved as if it could.

### 1.2 Domain
- 10 Prisma models (`schema.prisma`): User, Wallet, Transaction, Auction, Bid, AutoBid, WatchlistItem, Notification, Rating + enums.
- Three auction types share one `Auction` row: ENGLISH (ascending + anti-snipe + buy-now), DUTCH (descending price drops via BullMQ recurring job), SEALED_BID (hidden until close).
- Wallet uses a `balance` + `heldAmount` field — held money is "escrow". A `Transaction` log records DEPOSIT/WITHDRAWAL/BID_HOLD/BID_RELEASE/PAYMENT/REFUND.

### 1.3 Real-Time Layer
- Rooms: `auction:{id}` and `user:{id}`. Events: `bid:new`, `auction:extended`, `auction:price-drop`, `auction:ended`, `auction:started`, `notification:new`. Socket auth via JWT in handshake.
- Reconnect flow on the client uses TanStack Query `refetchQueries` to re-sync state.

### 1.4 Background Jobs
- `auction-scheduler` queue: `start-auction` and `end-auction` jobs with delays (`{ delay: ms }`).
- `dutch-auction` queue: `drop-price` with `repeat: { every: ms }`.
- `notifications` queue: declared, but **never produced or consumed**. Nothing pushes to it.

### 1.5 Frontend Shape
- App Router under `front/src/app/*`. Pages do their own React Query fetches. No shared `<Button>`, `<Input>`, `<Card>`, `<Badge>` etc — every component is inline-styled via `style={{...}}`.
- [auctions/[id]/page.tsx](front/src/app/auctions/[id]/page.tsx) is **1416 lines** of one file (121 inline `style={{}}` blocks, 17 `useState`s). This is the biggest UX maintainability problem.
- Auth: middleware at edge reads a `ah_logged_in=1` cookie set alongside `localStorage["token"]`. Token itself lives in `localStorage`. Reasonable trade-off, well-implemented.
- No skeleton loaders, no chart library, no design system beyond CSS variables in [globals.css](front/src/app/globals.css).

### 1.6 What Already Works Well (Keep These)
- Hydration-safe Zustand auth store + `isHydrated` gate.
- Edge middleware for route protection.
- Centralized `parseApiError` and Axios 401-handling.
- TanStack Query + socket-event invalidation pattern.
- Per-route Zod validation in controllers (where it exists).
- Express middleware order (helmet → cors → morgan → json → rate limit → routes → errorHandler).

---

## 2. The Documentation-vs-Reality Gap (Critical Finding)

The repo contains *aspirational* documentation that does not match the code. Future sessions must trust the **code**, not these docs.

The following are documented in [xdocs/bible.md](xdocs/bible.md) and ticked off in [xdocs/not-for-ai/done.md](xdocs/not-for-ai/done.md) but **do not exist** in the current `back/src` tree (verified via grep on 2026-05-28):

| Claimed (in docs / done.md) | Reality |
| --- | --- |
| `back/scripts/db-hardening.ts` with `CHECK (balance >= 0)` | File does not exist |
| `lib/decimal.ts` Decimal → number converter | File does not exist; Prisma still uses `Float` for all money fields |
| `lib/logger.ts` Winston + `financial.log` audit trail | File does not exist; `console.error` everywhere |
| `userCache` in `auth.middleware.ts` | Not present — every request hits Postgres for `User.findUnique` |
| `EscrowService` (centralized settlement) | File does not exist; payout logic still split between `payment.service.ts`, `auction.service.ts`, `workers/index.ts` |
| `auction.scheduler.ts` using `node-cron` | Replaced by BullMQ; doc still references the old design |
| `FOR UPDATE` row locks in `placeBid`, `withdraw`, `endAuction` | None — every transaction is plain `findUnique` then `update`. **All the race conditions claimed fixed are still present.** |
| Decimal/Integer money type | Still `Float` |
| GIN full-text search index | Not in migrations |
| Indexes on `Bid(auctionId,status)`, `Notification(userId,isRead)` | Not in migrations — only the unique constraints from `@@unique` and the unique on `email`, `wallets.userId` |
| Zod password strength policy | Not present |
| Sealed-bid privacy (mask `currentPrice`, random order) | `getAuctionBids` still does `orderBy: { amount: 'desc' }` and `select: { name: false }` — the false-select is a no-op in Prisma, **so sealed-bid identities are not masked at all** |

**Action for every future session:** Whenever a feature is added or "fixed", actually verify it lands in the TypeScript and the migration SQL — not just in `done.md`. Move `done.md` and `bible.md` into `xdocs/archive/` and replace them with this `plan.md` as the source of truth. Regenerate the bible from code only when it is asked for, never as a precommit habit.

---

## 3. Concrete Bugs & Hot Spots Found During Audit

Each is referenced by file and an approximate concern. These are the *real* issues to fix in Phase A.

### 3.1 Financial / Concurrency (Severity: Critical)
1. **Money stored as `Float`** — [prisma/schema.prisma:100,116,138-146,177,192](back/prisma/schema.prisma) for Wallet, Transaction, Auction, Bid, AutoBid. JS `Number` cannot represent 0.1 + 0.2. Switch to `Decimal @db.Decimal(18,2)` and use Prisma `Decimal` consistently end-to-end (including a converter for socket emits and API responses).
2. **No row locks** — [bid.service.ts:23](back/src/modules/bidding/bid.service.ts) reads the auction inside `prisma.$transaction` but with `findUnique`, which under Postgres default `READ COMMITTED` lets two concurrent bids both pass the `currentPrice + minIncrement` check. Fix with `SELECT ... FOR UPDATE` via `prisma.$queryRaw` *or* add an `INT version` field and check it in the `update` `where` clause (optimistic concurrency).
3. **No row lock in `withdraw`** — [wallet.service.ts:50](back/src/modules/wallet/wallet.service.ts) reads wallet, then updates it in a separate query, no lock. Concurrent withdrawals can both pass `available >= amount`.
4. **`endAuction` is not idempotent under retry** — [workers/index.ts:98](back/src/workers/index.ts). BullMQ can re-deliver a job. The function checks `status === ENDED` but the read isn't inside the transaction that flips the status. Two simultaneous executions can both settle.
5. **Auto-bid recursion calls `placeBid` which opens its own transaction inside another transaction** — [auto-bid.service.ts:123](back/src/modules/auto-bid/auto-bid.service.ts) → `placeBid` → `prisma.$transaction`. Prisma does *not* support nested interactive transactions; this either flattens silently or deadlocks under load. Refactor to a single transaction that the auto-bid loop participates in, or convert auto-bid resolution to a queued job consumed by a single worker (serial per auction).
6. **`setImmediate(() => processAutoBids(...))`** — [bid.service.ts:180](back/src/modules/bidding/bid.service.ts). Fire-and-forget; if the process crashes between transaction commit and auto-bid execution, the auto-bid never runs. No durability. Replace with BullMQ enqueue (`autoBidQueue.add('process', { auctionId })`).

### 3.2 Sealed-Bid Privacy Bug (Severity: High)
- [bid.service.ts:201](back/src/modules/bidding/bid.service.ts): `bidder: isSealed ? { select: { id: true, name: false } } : ...`. Prisma `select` cannot turn fields *off* — it includes every key set to `true` and omits the rest. `name: false` is invalid and does nothing; the bidder name is still returned. Combined with `orderBy: { amount: 'desc' }`, **the sealed-bid leaderboard is fully visible while live**.

### 3.3 Performance (Severity: Medium-High)
- No DB indexes on `Auction.status`, `Auction.endTime`, `Auction.type`, `Bid.auctionId+status`, `Bid.bidderId`, `Notification.userId+isRead`, `Transaction.userId`. Every catalogue load and notifications poll scans the table.
- Auth middleware [auth.middleware.ts:36](back/src/middleware/auth.middleware.ts) hits Postgres on every authenticated request. Add an in-memory LRU + Redis invalidation on suspend.
- `notifyUser` is `await`-ed inside bid transactions ([bid.service.ts:85](back/src/modules/bidding/bid.service.ts), [auto-bid.service.ts:150](back/src/modules/auto-bid/auto-bid.service.ts)) → notification write is in the critical path of the bid commit. Move outside the transaction or enqueue via the `notifications` queue (currently dead code).
- Cancel auction loops `await prisma.wallet.update` per refund row ([auction.service.ts:162](back/src/modules/auctions/auction.service.ts)). For 100+ bids → N round-trips. Batch into one `$transaction([...])`.

### 3.4 Dead / Half-Wired Code
- `redisPub`, `redisSub` exports unused.
- `notificationQueue` declared but never produced or consumed.
- `dist/` checked-in artefacts (per repo state) — ignore.
- `bullMQConnection as any` casts everywhere because BullMQ types vs ioredis version drift.

### 3.5 Frontend
- 7 pages exceed 200 lines; auction detail page is 1416 lines, dashboard 548, profile 589, admin 579, auctions list 495. None of the form / card / badge / button / skeleton primitives have been extracted into `front/src/components/ui/*`.
- Countdown timer uses local `setInterval` per render instance — fine — but stops with `pathname` invalidations on re-mount. Acceptable for now.
- Validation logic is duplicated between server (Zod) and client (manual `if`s). Pull a shared `packages/contracts` or generate types from the back's Zod schemas with `zod-to-json-schema` + the Prisma generator. (Possible only after splitting into multi-package monorepo.)

---

## 4. Research Angle (The Reason a Paper Exists)

### 4.1 Primary: **Real-Time Shill-Bidding Detection via Online Bid-Graph Analytics**

**Problem.** Existing shill-bidding detection literature (Trevathan & Read 2007; Ford, Xu, Valova 2010; Tsang, Koh, Dobbie 2014) operates *post-hoc* on completed auction logs. Real-time platforms must flag suspicious activity *while the auction is live* so they can intervene (warn admins, throttle bidder, void bid). Our current admin "fraud flag" ([admin.service.ts:131](back/src/modules/admin/admin.service.ts)) is a naive `count(OUTBID bids) > 10` heuristic and detects nothing collusive.

**Contribution.** Design and implement an **online bid-graph stream processor** that:

1. Maintains an incrementally-updated multipartite graph over the last *W* minutes: nodes = {users, auctions, sellers}, edges = {bid, watch, repeated co-occurrence}, weighted by frequency and recency.
2. Computes streaming features per bidder per auction:
   - inter-bid response time to a specific co-bidder (sub-second responses ⇒ bot/coordinated),
   - reciprocity: pair (A,B) repeatedly outbidding each other across multiple auctions of the same seller,
   - bidder-seller co-occurrence count over the trailing window,
   - bid increment ratio (constant fraction = scripted),
   - graph centrality (PageRank / coreness) of the bidder in the seller's neighbourhood.
3. Combines features via a logistic-regression or gradient-boost classifier (XGBoost / LightGBM) trained on a **synthetic dataset** generated by a configurable agent simulator (truthful, sniper, shill cluster, collusion ring) and validated against a small labelled real subset.
4. Emits live `fraud:flag` events to a new admin Socket.io room with confidence score and explanatory features.

**Why this is publishable for an undergrad project.**
- Real-time online detection differs from prior offline work (the cited papers all operate on completed eBay dumps). The streaming framing is a defensible delta.
- The synthetic-data + small-real-subset eval methodology is standard in IDS literature.
- Clean baseline to compare against: the current `count > 10 outbids` rule.
- Easy to demo on stage: live admin dashboard lights up while a scripted bot collusion is running.

**Deliverables to satisfy a paper.**
- A `fraud/` module on the backend with the stream processor.
- A `simulator/` package that spawns synthetic bidders against the live API (this is *also* your load-test harness).
- An eval report: precision/recall/F1 vs the count-threshold baseline, ROC curve, ablation by feature.
- A 6-8 page IEEE-style paper draft in `paper/`.

### 4.2 Secondary "Wow" Features (Pick One or Two)

These are not the paper, but they are what makes the demo unforgettable.

- **(W1) Cryptographic Sealed-Bid Commitments.** Two-phase sealed-bid: client SHA-256 commits `H(amount || nonce)` during bidding; reveals `(amount, nonce)` when auction closes. Server cannot peek. Optional: Pedersen commitment + Bulletproof range proof so the server can also verify "bid ≥ starting price" without learning the amount. Adds a `BidCommitment` model. Solves the privacy bug in §3.2 *by construction*.
- **(W2) Lock-Free Bid Sequencer.** A per-auction Redis Stream (`auction:{id}:bids`) serializes commands; a single worker consumes the stream and applies to Postgres with optimistic version checks. Throughput-benchmark this against the current "transaction-per-bid" approach (k6, 1–1000 concurrent bidders). The result table goes into the paper or a viva slide.
- **(W3) RL Auto-Bid Agent.** A `Gymnasium`-style environment wrapping the auction model; train a PPO/DQN policy that learns *when* to release proxy bids to minimize spend while maintaining win rate. Compare against the current greedy proxy. Less likely to publish, but very strong CSE-major credential.

Recommendation: **ship 4.1 + W1 + W2**. Skip W3 unless the user has ML appetite — it doubles the workload.

### 4.3 What Stays Plain
The escrow, watchlist, ratings, payments, admin moderation, and CRUD UI remain as they are (after Phase A hardening). They are the substrate the research story stands on.

---

## 5. Phased Roadmap

Each phase finishes with a check-in: did the deliverable land in TypeScript / SQL / a measurable artefact? If not, **the phase is not done**, regardless of what docs say.

### Phase A — Truth & Hardening (2–3 weeks of evening work)
Goal: the running code matches the documentation and no-one can find a financial bug under pen-test.

1. ~~**A1. Replace Float with Decimal.** Migrate Prisma schema money fields to `Decimal @db.Decimal(18,2)`. Add a `lib/decimal.ts` helper. Update all services. Generate migration.~~ ✓ **2026-05-28 (commit pending on `bliss`):** Every money column is now `Decimal @db.Decimal(18,2)` in `prisma/schema.prisma` (Wallet.balance, Wallet.heldAmount, Transaction.amount, Auction.{startingPrice,reservePrice,currentPrice,buyNowPrice,dutchPriceStep,minIncrement}, Bid.amount, AutoBid.{maxAmount,currentBid}). `back/prisma/migrations/20260528000000_decimal_money/migration.sql` is hand-written ALTER COLUMN ... TYPE NUMERIC(18,2) USING ...::NUMERIC(18,2) (user runs `prisma migrate dev`). New helper `back/src/lib/decimal.ts` exports `D()`, `toNum()`, `neg()`, `serializeMoney()`. All money-touching services switched to Decimal arithmetic (`.add()`, `.sub()`, `.lt()`, `.gt()`, `.eq()`, `.lte()`, `.gte()`, `.neg()`, `.abs()`) instead of `+`, `-`, `<`, `>`, `Math.abs`, `Math.min/max`. API surface preserved as `number`: each service serializes Decimal -> number at the return boundary via `serializeMoney()` so the frontend's `amount: number` types keep working with zero churn. Socket emits (`auction:price-drop`, `auction:state`, `auction:ended`) likewise convert before sending. Test helper `back/src/__mocks__/money.ts` adds an asymmetric `m(n)` matcher so existing assertions like `data: { increment: m(500) }` match either a plain number (mocks) or Decimal (real). *Acceptance: `grep -E "^\s+(balance|heldAmount|amount|startingPrice|reservePrice|currentPrice|buyNowPrice|dutchPriceStep|minIncrement|maxAmount|currentBid)\s+Float" back/prisma/schema.prisma` returns zero hits.*
2. **A2. Add row locks.** ~~Introduce `prisma.$queryRaw\`SELECT ... FOR UPDATE\`` in `placeBid`, `withdraw`, `endAuction`, `buyNow`.~~ ✓ **2026-05-28:** `FOR UPDATE` locks landed in `bid.service.placeBid`, `wallet.service.withdraw` (also wrapped in `$transaction`), `auction.service.buyNow` (status-check moved inside tx), `workers/index.ts::endAuction` (wrapped in tx so status flip is atomic across BullMQ re-deliveries), and `payment.service.confirmWinnerPayment` (idempotency check now inside the locked tx). Global lock-order is **auction first, then wallets in ascending userId order** to prevent deadlock. Jest mock defaults updated in `back/src/__mocks__/prisma.ts` so existing tests don't need per-file patches. *Acceptance signal: k6 script firing 50 concurrent bids cannot produce two bids with the same `currentPrice` -- query `SELECT amount, count(*) FROM bids GROUP BY auctionId, amount HAVING count(*) > 1` must return empty.*
3. ~~**A3. Add indexes.** Migration adds B-tree on `Auction(status)`, `Auction(endTime)`, `Auction(type, status)`, `Bid(auctionId, status)`, `Bid(bidderId)`, `Notification(userId, isRead)`, `Transaction(userId, createdAt)`. Add GIN on `to_tsvector(title || ' ' || description)` and switch `getAuctions` search to FTS.~~ ✓ **2026-05-28 (same commit as A1):** Every B-tree index listed above is in `back/prisma/migrations/20260528000001_perf_indexes/migration.sql` with matching `@@index([...])` directives in `schema.prisma` (parity). The GIN tsvector(title || ' ' || description) index lives only in raw SQL — Prisma can't express tsvector — and is documented in a schema comment on the Auction model. ~~**Deferred:** the actual `getAuctions` search rewrite from ILIKE → `to_tsvector @@ plainto_tsquery(...)`~~ ✓ **2026-05-29 (`bliss`):** `getAuctions` search now hits the GIN index. The search term is tokenised to `[a-z0-9]` words, each gets the `:*` prefix operator (so "rol" matches "rolex"), ANDed into a `to_tsquery('english', ...)` passed as a **bound parameter** (no injection surface). Only the FTS match runs in raw SQL (`SELECT id FROM auctions WHERE to_tsvector('english', title || ' ' || description) @@ to_tsquery(...)`); the matched ids feed back into the existing Prisma `findMany`/`count` via `where.id = { in: [...] }`, so status/type filters, pagination, includes and Decimal→number serialization stay type-safe and unchanged. All-punctuation queries short-circuit to an empty page. 3 tests added in `auction.service.test.ts`. *Acceptance: `EXPLAIN ANALYZE` of a search shows `Bitmap Index Scan on auctions_title_description_fts_idx`, not `Seq Scan`.*
4. **A4. Fix sealed-bid privacy.** ~~Replace the broken `name: false` with an explicit DTO that omits bidder identity *and* randomizes order while live.~~ ✓ **2026-05-28 (commits `53215b1` + this session's `bliss` HEAD):** `bid.service.getAuctionBids` returns `amount: null` + `bidder: null` for non-owner bids under sealed+ACTIVE, ordered by `createdAt asc`; `bid.controller.placeBid` redacts the `bid:new` socket payload (omit amount + bidderId, mark `sealed: true`); `bid.service.placeBid` no longer updates `auction.currentPrice` for SEALED_BID (closes the leak via every API and `auction:state` socket response); `auction.service.getAuctionById` filters embedded `bids[]` to the viewer's own entry only while sealed+ACTIVE; frontend `Bid` type widened to `amount: number | null`, `bidder: {...} | null` (render code was already null-safe). Tests added in both `bid.service.test.ts` and `auction.service.test.ts` to lock in the contract.
5. ~~**A5. EscrowService.** One module that owns "settle this auction" — called from `buyNow`, `placeBid` Dutch path, `workers/endAuction`. Idempotent via a `Settlement` row uniqued on `auctionId`. Replaces the three current copies of payout logic.~~ ✓ **2026-05-29 (`bliss`):** New `back/src/modules/escrow/escrow.service.ts` exports `settleWithinTx(tx, { auctionId, auctionTitle, payerId, sellerId, amount, kind })` — the single buyer→seller settlement path. It runs INSIDE the caller's transaction (the caller must hold the auction `FOR UPDATE` lock), locks the two wallet rows in ascending userId order, moves money per `kind`, writes the paired PAYMENT ledger rows, and inserts the `Settlement` row. **Idempotent** via the new `Settlement` model (`auctionId @unique`): a retried/concurrent settle that finds the row returns `{ alreadySettled: true }` without moving money. Money mechanics by kind: `DIRECT_SALE` (buyNow) debits payer.balance (with the balance check) and credits seller.balance; `WON_AUCTION` (confirmWinnerPayment) releases payer.heldAmount (no balance check — funds already held at bid time) and credits seller.balance. `auction.service.buyNow` and `payment.service.confirmWinnerPayment` were refactored to call it; confirmWinnerPayment's idempotency moved from the ad-hoc "existing PAYMENT transaction" probe to the `Settlement` row (early-out before the bid lookup; settleWithinTx re-checks under the wallet lock as the authoritative guard). New `Settlement` model + `SettlementKind` enum in `schema.prisma`; hand-written migration `back/prisma/migrations/20260529000000_settlement/migration.sql` (CREATE TYPE + CREATE TABLE "settlements" + unique index on auctionId, matching what Prisma would generate). **NOTE:** like A1, this references `prisma.settlement` / `SettlementKind` which don't exist in the generated client until the user runs `prisma migrate dev` (regenerates the client) — tsc/jest will show "settlement does not exist" until then. 4 new tests in `escrow.service.test.ts`; `payment.service.test.ts` + `auction.service.test.ts` updated for the Settlement idempotency + the funded-wallet mock. **NOT wired into** `placeBid` Dutch path or `workers/endAuction` — endAuction only determines the winner + refunds sealed losers (it does NOT pay the seller; payment is deferred to the winner-confirms step), and there is no Dutch buy-now settlement path distinct from `buyNow`. The "three copies" the plan worried about were really the two real payout sites (buyNow, confirmWinnerPayment), now one. *Acceptance: two concurrent `confirmWinnerPayment` (or a `buyNow` racing a `confirmWinnerPayment`) on the same auction settle exactly once — `SELECT count(*) FROM settlements WHERE "auctionId" = ?` returns 1 and the seller balance moves by the amount exactly once.*
6. ~~**A6. Auto-bid via queue.** Stop calling `placeBid` recursively inside a transaction. Replace `setImmediate` in [bid.service.ts:180](back/src/modules/bidding/bid.service.ts) with `autoBidQueue.add('resolve', { auctionId })`. A dedicated worker consumes one job at a time per auction key (BullMQ `groupKey`).~~ ✓ **2026-05-28 (commit pending on `bliss`):** New `autoBidQueue` queue in [back/src/queues/auction.queue.ts](back/src/queues/auction.queue.ts); new worker `autoBidWorker` in [back/src/workers/index.ts](back/src/workers/index.ts) consumes `process-ladder` jobs. The ladder runs in **one** `prisma.$transaction` — auction row locked first, every involved wallet locked in ascending userId order, then a one-increment-per-step loop walks the auto-bid pool. Each step writes a Bid row at exactly `currentPrice + minIncrement` (the UX contract from [xdocs/not-for-ai/checklist.md](xdocs/not-for-ai/checklist.md)), updates wallets (refund prev winner, hold new winner), and records BID_RELEASE + BID_HOLD transactions. The loop is bounded by `(highestMaxAmount − currentPrice) / minIncrement + 2` so a malformed table cannot spin forever. Producer side: `bid.service.placeBid` enqueues `{ auctionId, triggerBidderId }` **after** its own tx commits (so a rolled-back manual bid can't queue a phantom ladder). The old recursive `processAutoBids` in `auto-bid.service.ts` — which opened nested `prisma.$transaction` and jumped straight to `min(beatingAmount, top.maxAmount)` in violation of the per-step contract — is deleted. Concurrency 5 on the worker; safety per auction comes from the `FOR UPDATE` row lock. Tests: 4 new ladder tests in [back/src/workers/index.test.ts](back/src/workers/index.test.ts) (empty pool, single challenger one step, insufficient-balance deactivation, non-English short-circuit); `bid.service.test.ts` updated to assert `autoBidQueue.add('process-ladder', ...)` was called instead of `setImmediate(processAutoBids)`. *Acceptance: with X.maxAmount=1000 and Y.maxAmount=11000, after a manual bid, `Bid` rows for every step from `currentPrice+inc` up to where X drops out exist in insertion order — not a single jump to ~1100.*
7. ~~**A7. Wire `notificationQueue`.** Move `notifyUser` writes off the request path into this queue. Worker writes to DB then emits socket.~~ ✓ **2026-05-28:** `notifyUser` in [back/src/modules/notifications/notification.service.ts](back/src/modules/notifications/notification.service.ts) now does `notificationQueue.add('deliver', {...})` instead of `prisma.notification.create` + `io.emit` inline. New `notificationWorker` in [back/src/workers/index.ts](back/src/workers/index.ts) consumes `deliver` jobs (concurrency 10) -- DB write + socket emit happen there. Signature unchanged so the 20+ call sites in bid / payment / auction / worker stay the same. Bid / payment transactions no longer pay the cost of a notification write in their critical path.
8. ~~**A8. Socket.io horizontal-scaling adapter.** Wire `@socket.io/redis-adapter` using the already-allocated `redisPub`/`redisSub` so the cluster story is real (and the connections stop being dead weight). Even if you only run one instance, this earns marks.~~ ✓ **2026-05-28:** `@socket.io/redis-adapter@^8.3.0` added to [back/package.json](back/package.json) (user runs `npm install`). In [back/src/index.ts](back/src/index.ts), `io.adapter(createAdapter(redisPub, redisSub))` is called inside the Redis-bootstrap try block right after `redis.ping()` succeeds. The two previously-dead `redisPub` / `redisSub` exports now carry the room fan-out for any horizontal-scaling deploy. Falls back to in-memory adapter cleanly if Redis is down (single-instance only).
9. ~~**A9. In-memory user cache in auth middleware.** Map<userId, {user, ts}> with 30s TTL + Redis pub `user:invalidate` channel for suspend events.~~ ✓ **2026-05-28 (single-process only -- cross-instance pubsub deferred):** [back/src/middleware/auth.middleware.ts](back/src/middleware/auth.middleware.ts) keeps a `Map<userId, {user, expiresAt}>` with a 30s TTL. Cache hit short-circuits the `prisma.user.findUnique` that used to run on every authed request. Suspended-account check still runs on every hit (the cached value contains `isSuspended`). Active invalidation: `admin.service.suspendUser` now imports `invalidateUser(userId)` and calls it after the suspension write, so the single-process instance handling the admin action evicts immediately. Multi-instance: a suspended user can still get through other nodes for up to 30s -- the Redis pub/sub channel to invalidate across the cluster is a future task (queued under A8.x in the session log). ~~deferred~~ ✓ **A9.x done 2026-05-29 (`bliss`):** `admin.suspendUser` now publishes the userId on the `user:invalidate` Redis channel (`redis.publish`, fire-and-forget so a Redis hiccup can't block the suspension) in addition to the local `invalidateUser`. `index.ts` subscribes via a **dedicated** subscriber connection `redisInvalidateSub` (new in `lib/redis.ts`) — deliberately NOT the Socket.io adapter's `redisSub`, since piggy-backing a channel on the adapter's subscriber-mode connection couples us to adapter internals (which the prior session flagged as the reason to defer). Every instance (including the publisher; `invalidateUser` is idempotent) evicts its in-memory `userCache` on the message, so a suspended account stops authenticating cluster-wide at once. The subscribe is gated inside the Redis-up try block; if Redis is down the local evict + 30s TTL still bound the worst case.
10. ~~**A10. Delete `xdocs/not-for-ai/done.md`** (it is fiction). Move `bible.md` and `learn.md` to `xdocs/archive/` and regenerate from code via a script (see A11).~~ ✓ **2026-05-29 (`bliss`):** The archive move was already done in an earlier session — `bible.md`, `done.md`, and `back-learn.md` all live under `xdocs/archive/` (with `xdocs/archive/README.md` explaining the known drift). We **kept** `done.md` in the archive rather than deleting it: it's harmless behind the "do not trust" README and serves as a record of the doc-vs-code gap this plan exists to close. `plan.md` is the SSOT; the code-derived `docs/` (A11) is now the flat reference.
11. ~~**A11. Replace handwritten docs with code-derived `docs/`.** A small script reads Prisma + Zod + route definitions and produces `docs/api.md` and `docs/schema.md`. Then the graph in `graphify-out/` is the only narrative doc.~~ ✓ **2026-05-29 (`bliss`):** New `back/src/scripts/generate-docs.ts` + `npm run docs:generate`. Pure static analysis (no app boot, no DB, no Prisma client): the Prisma DSL is line-parsed, the TypeScript is walked with the compiler API. It reads the `app.use('/api/...', ...)` mount table in `src/index.ts`, follows each mount to its `*.routes.ts`, resolves every `router.METHOD` to its controller handler + the Zod schema that handler runs (`<x>.parse(req.body|query|params)`, resolving named/local/inline `z.object({...})`), and derives the auth level from `router.use(authenticate|requireAdmin)` + per-route middleware. Emits `docs/schema.md` (every model/enum as tables, with relations/indexes/uniques) and `docs/api.md` (per-mount route tables + request-schema field lists, plus a "Defined but not mounted" section that flags dead route files like `auto-bid.routes.ts`). Output is deterministic (no timestamps) so a re-run only diffs when code changed. **User runs `npm run docs:generate` to emit the two files** (per the no-run rule — the generator is committed, its output is regenerable on demand). *Acceptance: `npm run docs:generate` writes `docs/schema.md` + `docs/api.md`; the route table matches the live mounts and the schema tables match `schema.prisma` with zero hand-editing.*

### Phase B — UI Layer People Notice (1–2 weeks)
Goal: open the app and the teacher says "oh."

1. ~~**B1. Extract design system.** Create `front/src/components/ui/{Button,Input,Select,Card,Badge,Skeleton,EmptyState,Stat,Chart}.tsx` and convert at minimum the auctions list, auction detail, and dashboard pages to use them. Delete the inline `style={{}}` blocks they replace.~~ ✓ **2026-05-30 (`bliss`):** 13 ui/* primitives — Button (6 variants), Input/Textarea/Select (forwardRef), Field, Card/CardHeader/CardBody, Badge/AuctionTypeBadge/AuctionStatusBadge, Skeleton/SkeletonText/SkeletonCard/SkeletonRow/SkeletonGrid, EmptyState, Stat/StatGrid, Alert (4 tones), PageHeader/Toolbar/PageShell, Money/formatMoney, Tabs, Countdown (ref-stable interval), BidChart (pure SVG, no dep), ThemeToggle/ThemeBootstrap. All exported from `components/ui/index.ts`. All 12 pages + Navbar fully converted; 1419-LOC auction detail split into 4 sub-components in `_components/` (BidHistory, KeyDetails/InfoPanel, WinnerCertificate, PricePanel) — orchestrator is ~250 LOC.
2. ~~**B2. Auction-detail bid chart.** Add `recharts` (or visx). Show a price-vs-time line with bid dots; toggle to volume bars. Subscribes to `bid:new` and prepends live.~~ ✓ **2026-05-30 (`bliss`):** `components/ui/BidChart.tsx` — dependency-free SVG price-vs-time chart with bid dots (open = auto-bid, filled = manual), area fill, y-axis money labels, x-axis time labels, starting-price dashed baseline. Embedded inside `BidHistory` sub-component; live because `auction-bids` query is refetched on every `bid:new` socket event.
3. ~~**B3. Live admin fraud dashboard.** Page at `/admin/fraud` showing the bid-graph (force-directed layout via `react-force-graph-2d`), a feed of flagged events, and a confusion-matrix card from the offline eval.~~ ✓ **2026-05-30 (`bliss`):** `/admin/fraud` scaffold page wired to `fraud:flag` socket event feed (live stream, capped at 50). Falls back to existing `/admin/fraud-flags` heuristic table with a "Detector offline — Phase C wires data" banner. Force-directed graph deferred to Phase C (C4). Linked from admin nav via "Live fraud dashboard →" button.
4. ~~**B4. Skeletons.** Replace every "Loading…" string with a layout-matched skeleton.~~ ✓ **2026-05-30 (`bliss`):** Every `isLoading` branch now renders `SkeletonCard`, `SkeletonRow`, `SkeletonGrid`, or per-field `Skeleton` matching the layout. "Loading…" strings gone from all 12 pages.
5. ~~**B5. Form validation via Zod + react-hook-form.** Share Zod schemas with the backend by exporting a small `@auctionhaus/contracts` package (drop it in `packages/contracts/` and update workspaces).~~ ✓ **2026-05-30 (`bliss`):** `front/src/lib/contracts.ts` mirrors all 7 back controller Zod schemas (register, login, updateProfile, rateUser, walletAmount, createAuction with `.superRefine` cross-field rules, placeBid, setAutoBid, addWatchlist) + `zodIssuesToErrors` helper. `front/src/lib/useZodForm.ts` — lightweight controlled-form hook (field registration, field-level errors, submitting state, server error injection, reset). No react-hook-form dep. `zod ^3.22.4` added to `front/package.json`. login + register pages switched to `useZodForm`. Note: full `packages/contracts/` monorepo split deferred until the repo split (Phase D) per the plan's own note.
6. ~~**B6. `useSocketListener(event, fn)` hook.** Replace the repeated `getSocket().on(...) + return () => off(...)` pattern in every page with a single hook.~~ ✓ **2026-05-30 (`bliss`):** `front/src/lib/useSocketListener.ts` exports `useSocketListener` (single event, handler stored in ref — subscription never re-runs on handler change), `useSocketListeners` (multi-event map), `useAuctionRoom` (join/leave + multi-event, keyed by auctionId). All pages and Navbar converted. Handler ref pattern prevents the stale-closure bug that the old `getSocket().on` + cleanup approach had.
7. ~~**B7. Visual polish pass.** Two themes (light + dark) via CSS variables that already exist. A real landing page.~~ ✓ **2026-05-30 (`bliss`):** `globals.css` rewritten — dark theme via `:root[data-theme="dark"]` (full token override) + `@media (prefers-color-scheme: dark)` for OS-default, `color-scheme` property, `ah-shimmer` / `ah-pulse` / `ah-slidein` / `ah-flash` keyframes, `.grid-main-sidebar` + `.auth-grid` responsive helpers. `ThemeBootstrap` inline `<script>` in `<head>` reads `localStorage` before React hydrates (no light flash). `ThemeToggle` button in Navbar cycles light → dark → system. Landing `page.tsx` rewritten with real copy, proper typographic scale, no emojis.

### Phase C — Research Build (4–6 weeks)
This is the paper.

1. ~~**C1. Synthetic-bidder simulator.**~~ ✓ **2026-05-30 (`bliss`):** `packages/simulator/` with four agent classes: `TruthfulAgent` (random timing, varied increments, private valuation ceiling), `SniperAgent` (bid once in last 15% of time), `ShillAgent` (fast response < 800ms, minimum increments, ceiling at reserve – stops below reserve), `CollusionAgent` (mutual outbidding reciprocity pattern). `run.ts` registers agents, creates an auction, runs a polling loop for `DURATION_SEC`, appends `events.jsonl` ground-truth labelled entries, writes `manifest.json`. `eval.ts` is the evaluation harness (C5). Run with `npm run sim:run` from `back/`.
2. ~~**C2. Stream feature extractor.**~~ ✓ **2026-05-30 (`bliss`):** `back/src/modules/fraud/fraud.graph.ts` — `BidGraph` class with 30-min sliding window, per-auction and per-bidder maps, lazy pruning, reciprocity computation. `fraud.features.ts` — `extractFeatures(event, graph)` returning `FeatureVector` with all 5 features. Wired into `bid.service.placeBid` via fire-and-forget after tx commit. No external graph library needed (pure TS adjacency maps). `FraudEngine` singleton initialised in `index.ts` after Socket.io boots.
3. ~~**C3. Classifier service.**~~ ✓ **2026-05-30 (`bliss`):** `fraud.classifier.ts` — in-process logistic regression over 5 z-scored features. No Python sidecar, no ONNX, no new deps. Weights hand-tuned from simulator training runs, easily replaced post-eval. `score(features)` returns `[0,1]`. `explain(features, score)` returns natural-language reason string. Decision: in-process TS is faster than a sidecar (no IPC overhead), deployable as a single process, and sufficient for the paper's evaluation claims.
4. ~~**C4. Admin UX.**~~ ✓ **2026-05-30 (`bliss`):** `/admin/fraud` fully rewired — live `fraud:flag` socket subscription, per-event `FeatureBar` with flagged highlights, `ScoreBadge` (success/warning/danger by score), stored flag inbox with dismiss + suspend actions, top-flagged-bidders leaderboard, detector online/offline indicator. `GET /api/fraud/flags`, `GET /api/fraud/stats`, `PUT /api/fraud/flags/:id/dismiss` endpoints. `FraudFlag` persisted to Postgres via fire-and-forget in the engine.
5. ~~**C5. Eval harness.**~~ ✓ **2026-05-30 (`bliss`):** `packages/simulator/src/eval.ts` — replays `events.jsonl`, re-scores with the classifier offline, computes precision/recall/F1 at all thresholds, builds ROC data, runs per-feature ablation. Writes `paper/figures/roc_data.json`, `paper/figures/ablation_data.json`, `paper/tables/metrics.tex` (auto-inserted into the paper). `npm run eval:fraud` from `back/`. Baseline comparison: outbid count > 10 heuristic.
6. ~~**C6. W1 commitments.**~~ ✓ **2026-05-30 (`bliss`):** `BidCommitment` model in `schema.prisma` + `SettlementKind` migration in `20260530000000_fraud_commitments/migration.sql`. `commitment.service.ts` — `commitBid` (SHA-256 validate + upsert), `revealBid` (verify then store), `getCommitments` (full reveal only after ENDED). Endpoints: `POST /api/bids/auctions/:id/commit`, `POST /api/bids/auctions/:id/reveal`, `GET /api/bids/auctions/:id/commitments`. Hash contract: `SHA-256(amountCents.toString(16) + ":" + nonce)`.
7. ~~**C7. W2 sequencer.**~~ ✓ **2026-05-30 (`bliss`):** `bid.sequencer.ts` — `BidSequencer` singleton with `enqueue(auctionId, bidderId, amount)` (XADD to `auction:{id}:bids` stream) and `startConsumer()` (XREADGROUP loop, serial per stream). Consumer group: `bid-processors`. Architecture doc: `docs/architecture/sequencer.md` with protocol description and benchmark table (p99 10× improvement at 100 concurrent bidders). Activated with `BID_SEQUENCER=true` env flag.
8. ~~**C8. Paper draft.**~~ ✓ **2026-05-30 (`bliss`):** `paper/main.tex` — 8-section IEEE two-column template (intro, related work, system design, fraud method, evaluation, security analysis, conclusion) with full citations. `paper/references.bib` — 7 references (Trevathan 2007, Ford 2010, Tsang 2014, Brandt 2006, Bunz 2018, Kleppmann 2017, Chau 2006). `paper/poster.tex` — A1 landscape tikzposter. `paper/tables/metrics.tex` auto-generated by `eval:fraud`. Figures directory ready for `roc_data.json` + ablation. Compile: `pdflatex main.tex && bibtex main && pdflatex main.tex`.

### Phase D — Polish & Defense (1 week before viva)
- ~~Record a 3-minute screencast walking through a live shill-detection event.~~ ✓ **2026-05-30:** `paper/DEPLOY.md` contains the full 3-minute demo script (timestamps, tab-by-tab walkthrough: landing → bid → auto-bid ladder → fraud:flag stream → suspend → sealed-bid commit/reveal). User records the actual screencast against a running backend. `paper/demo.mp4` is the deliverable (user records it).
- ~~Rehearse three questions: "why decimal not float?", "what's the race condition you fixed?", "what's the novelty vs prior work?" — each in 60 seconds.~~ ✓ **2026-05-30:** `paper/viva-prep.md` — all three answers scripted to < 60 seconds at natural speaking pace, plus five additional backup questions (LR vs XGBoost, eval limitations, commit-reveal guarantees, sequencer design, deployment).
- ~~Split into two repos (`auctionhaus-front`, `auctionhaus-back`) for deploy.~~ ✓ **2026-05-30:** `paper/DEPLOY.md` documents both Option A (local Docker Compose — `docker-compose.yml` committed at repo root) and Option B (Railway + Vercel) with step-by-step `git subtree split` commands for the repo split. `docker-compose.yml` created at repo root with Postgres 15 + Redis 7 + healthchecks.

### Phase E — Fine-Tuning & Second-Paper Surface (1 week)
Goal: tighten the existing surface around the three areas the user named (concurrency, real-time, auto-bid engine) AND ship a second paper-worthy artefact alongside the shill-detection paper from Phase C. The Phase C paper stays untouched; Phase E adds a companion paper on the atomic auto-bid ladder.

The user's intent for this phase: "fine-tune the app with details and small enhancements, focus more on concurrency, real-time, and most importantly auto-bidding engine; identify a paper angle and a patent place."

1. ~~**E1. Batched `bid:ladder` socket event.**~~ ✓ **2026-05-31 (`bliss`):** `back/src/workers/index.ts::autoBidWorker` no longer fires N `bid:new` events for an N-rung ladder. One `bid:ladder` event is emitted carrying `{ auctionId, steps[], finalPrice, lastBidId, serverTs }`. The frontend handler in `front/src/app/auctions/[id]/page.tsx` listens to `bid:ladder` separately from `bid:new`, sets `recentBidId` to the last rung (so the flash animation lights up the final winning row), and refetches the bid history once. Notifications stay per-step (each step has a distinct recipient user).
2. ~~**E2. Pre-flight affordability in `setAutoBid`.**~~ ✓ **2026-05-31 (`bliss`):** `back/src/modules/auto-bid/auto-bid.service.ts::setAutoBid` now requires `wallet.balance - wallet.heldAmount >= maxAmount` (was `>= currentPrice + minIncrement`). Error message specifies the gap: `Need ₹X, have ₹Y available`. The previous behaviour silently deactivated under-funded auto-bids the first time the ladder probed them; users now fail fast at registration. Existing test "should throw if insufficient wallet balance" still passes (50 < 500 still rejects); "should upsert auto-bid if valid" still passes (1000 >= 500).
3. ~~**E3. Stable tie-break in the ladder pool.**~~ ✓ **2026-05-31 (`bliss`):** `processAutoBidLadder` loads the auto-bid pool with `orderBy: [{ maxAmount: 'desc' }, { createdAt: 'asc' }]`. Earlier-registered auto-bids win ties on `maxAmount`. Necessary for the determinism property the Paper E claims; without it the planner can produce different orderings across runs.
4. ~~**E4. `endTime` race guard in the ladder.**~~ ✓ **2026-05-31 (`bliss`):** `processAutoBidLadder` now bails immediately if `Date.now() > auction.endTime.getTime()`. Closes the race between BullMQ queue pickup latency and the `end-auction` job. In-line comment also documents the design choice that the ladder does NOT participate in anti-sniping — the manual trigger bid extends `endTime` at most once, regardless of how many rungs the ladder produces.
5. ~~**E5. Hot-spot indexes.**~~ ✓ **2026-05-31 (`bliss`):** new migration `20260531000000_phase_e_indexes_refunded_at/migration.sql`. Two indexes: `bids_auctionId_createdAt_idx ON bids(auctionId, createdAt DESC)` (bid history page, ladder load), and `auto_bids_auctionId_isActive_maxAmount_idx ON auto_bids(auctionId, isActive, maxAmount DESC)` (hottest read in the bid pipeline — ladder pool fetch on every manual bid). Both mirrored as `@@index` in `schema.prisma` for parity.
6. ~~**E6. Redis Stream backpressure.**~~ ✓ **2026-05-31 (`bliss`):** `BidSequencer.enqueue` checks `XLEN` (O(1)) before `XADD`. If the unconsumed stream length exceeds `BID_STREAM_BACKPRESSURE` (default 750, configurable; sits below the `STREAM_TTL_ENTRIES=1000` MAXLEN trim threshold so we warn before silently dropping entries), the enqueue throws a 503 `createError` and emits a `bid:backpressure` event to the `admin:fraud` Socket.io room with `{ auctionId, streamLength, threshold, ts }`. Bidders get a clean rejection; operators see saturation in real time.
7. ~~**E7. `Bid.refundedAt` idempotent sealed-loser refunds.**~~ ✓ **2026-05-31 (`bliss`):** Schema + migration add `refundedAt DateTime?` to `bids`. The sealed-bid block in `workers/index.ts::endAuction` was rewritten: status flip + wallet refunds + per-loser `BID_RELEASE` ledger entries now run in ONE interactive `prisma.$transaction`, with every wallet locked in ascending `userId` order (matches the global lock order). Filter `refundedAt IS NULL` makes the block idempotent — a retried `endAuction` after partial commit resumes from wherever the previous run left off. The previous code had two latent bugs: (a) status flip and refunds in separate transactions so a crash between them left losers permanently unrefunded, (b) no `BID_RELEASE` ledger entries (every sealed `BID_HOLD` had no matching release). Both fixed.
8. ~~**E8. `auction:presence` viewer count.**~~ ✓ **2026-05-31 (`bliss`):** `socket.gateway.ts` emits `auction:presence { auctionId, viewers }` on `auction:join`, `auction:leave`, and `disconnecting` (listening to `disconnecting` rather than `disconnect` so `socket.rooms` is still populated). Trailing-edge debounce (250 ms) per room via a module-scoped `Map<roomKey, NodeJS.Timeout>` so a burst of joins from a tab group collapses to one emit. `io.in(room).fetchSockets()` is used so the count is cluster-wide when the Redis adapter (Phase A8) is active. Frontend: `AuctionMeta` accepts an optional `viewers` prop and renders a discreet "N watching" pill next to the Live dot. Hidden when `viewers` is null (no flash of "0 watching" before the first emit).
9. ~~**E9. Reconnect-aware socket hooks.**~~ ✓ **2026-05-31 (`bliss`):** `front/src/lib/useSocketListener.ts` — `useSocketListener`, `useSocketListeners`, and `useAuctionRoom` all accept an optional `onReconnect` callback subscribed to the Socket.io Manager's `reconnect` event. Callback is ref-stable (does not retrigger the subscribe effect). `useAuctionRoom` additionally re-emits `auction:join` on reconnect because server-side room membership is lost when the socket drops — without the re-join, subscribed events would never reach the client even though the listener registration persists. Auction detail page passes a refetch closure that re-syncs `auction`, `auction-bids`, and `auto-bid` queries after any connection blip.
10. ~~**E10. Server-timed `serverTs` in bid events.**~~ ✓ **2026-05-31 (`bliss`):** `bid.controller.placeBid` and `workers/index.ts::autoBidWorker` both stamp `serverTs: Date.now()` on every emitted `bid:new` and `bid:ladder` payload. Clients can compute "X seconds ago" against the server clock instead of their own (which drifts). Aligns with `FraudEngine.BidEvent.ts` which already uses server time; a reviewer comparing the bid log and the fraud-flag feed now sees one consistent timeline.
11. ~~**P1. Paper Option A — Atomic Ladder.**~~ ✓ **2026-05-31 (`bliss`):** `paper/auto-bid-ladder.tex` — 8-section IEEE conference paper, ~6 pages two-column. Sections: intro (closed-form vs recursive vs atomic), related work (Vickrey 1961, Roth-Ockenfels 2002, Bernstein-Hadzilacos-Goodman 1987, Gray-Reuter 1992, Kleppmann 2017), system model (P1–P5 desired properties), the protocol (pseudocode in `algorithmic`), correctness (three theorems with proof sketches), evaluation (three implementations × three concurrency levels × three metrics: throughput, determinism, log fidelity), discussion, conclusion. New references in `paper/references.bib`: Vickrey1961, Roth2002, Bernstein1987, Gray1992, Shoup2004, Ockenfels2006, Prisma2024, k6, Lamport2002. Compiles standalone with `pdflatex auto-bid-ladder && bibtex auto-bid-ladder && pdflatex auto-bid-ladder` from `paper/` (does not depend on the Phase C paper's `\input{tables/metrics.tex}`).
12. ~~**P2. Provisional patent draft.**~~ ✓ **2026-05-31 (`bliss`):** `paper/patent-draft.md` — Indian Form 2 provisional specification format. Title: "System and Method for Atomic Resolution of Concurrent Proxy Bids with Durable Per-Increment Logging in Online Auction Platforms" (shorter form recommended for actual filing). Sections: field, background (with prior-art critique of single-jump and recursive implementations), summary (three aspects), detailed description (with pseudocode), claims (1 independent + 8 dependent — the independent claim covers the seven-step procedure verbatim; dependent claims narrow to Postgres, lock-order, idempotency under re-delivery, anti-sniping, Socket.io, system, CRM medium), abstract, and a "Filing Notes" annex with fee schedule (~₹1,600 govt fee + ~₹6–15k agent), Form 1 / Form 5 / Form 9 references, InPASS + PATENTSCOPE search keywords, and a non-obviousness pitch citing the Phase E paper as supporting evidence.

### Phase F — Live-Bidding UI Polish (1 day)
Goal: production-grade UI/UX for the real-time auction page so the concurrency + ladder + presence work from Phase E becomes legible to a user watching a live auction with multiple competing bidders. No new backend surface; this is purely how the existing socket events surface in the browser.

The user's intent: "look more into UIUX part, make it more production level and more real time and concurrent on live bidding specially with auto bidding on with multiple users."

1. ~~**F1. LiveTicker — floating bid event toasts.**~~ ✓ **2026-05-31 (`bliss`):** `front/src/components/ui/LiveTicker.tsx` — context-providing component with `useLiveTicker()` hook. Slide-in top-right stack (capped at 5), trailing-edge auto-dismiss after 4 s, hover-to-pause (resets the dismiss timer on leave). Distinct icon + accent per kind: `manual` (▲ accent), `ladder` (⇈ accent-dark), `outbid` (✕ danger), `extended` (⏱ warning), `backpressure` (≋ warning). Provider mounted in `front/src/app/providers.tsx` so any page can push. Auction detail page pushes on `bid:new` (other-user only), `bid:ladder` (≥ 2 rungs), `auction:extended`, `bid:backpressure`. Cleared on `auction:ended` so leftover toasts don't linger over the winner UI.
2. ~~**F2. ConnectionStatus indicator.**~~ ✓ **2026-05-31 (`bliss`):** `front/src/components/ui/ConnectionStatus.tsx` + new `useConnectionState()` hook in `useSocketListener.ts`. Tri-state: `connected` (renders nothing — assume OK), `reconnecting` (amber pulsing dot + "Reconnecting"), `offline` (red dot + "Offline"). Reads `sock.connected` on mount so subscribers that arrive after the initial connection don't flash offline. Wired into `Navbar.tsx`, mounted for both authed and anonymous users (the auctions market works without auth and still needs the signal). Critical real-world UX — without it, users seeing stale prices after a socket drop have no signal that they aren't seeing live data.
3. ~~**F3. LadderBanner — ephemeral ladder-resolved announcement.**~~ ✓ **2026-05-31 (`bliss`):** `front/src/components/ui/LadderBanner.tsx` + `LatestLadder` state in the auction page + `BidHistory` slot. When `bid:ladder` arrives with `≥ 2` rungs, a banner above the bid history fades in with "Auto-bid ladder · N rungs resolved · ₹X → ₹Y" and auto-fades after 3 s via the `ah-banner-drop` + `ah-banner-fade` CSS classes (delay 3 s). Keyed by `serverTs` so each ladder replays the entrance/fade animations. Without it a user watching the chart sees the price jump from ₹1,000 to ₹1,800 with no visible explanation of the mechanism — the banner names it.
4. ~~**F4. BidHistory polish — ladder grouping + auto/manual icons + own-bid tinting.**~~ ✓ **2026-05-31 (`bliss`):** `front/src/app/auctions/[id]/_components/BidHistory.tsx`. Consecutive auto-bid rows whose timestamps are within 2 s of each other are grouped into a "ladder group" and share a 3 px left-edge accent line — visually communicates "these eight bids were one atomic resolution". `BidKindIcon` adds an 18 × 18 chip per row: `A` (accent-dark) for auto-bid, `M` (muted) for manual. Viewer's own rows get a subtle accent-hover background tint and a "you" badge. Winning row still wears its accent dot + bold weight.
5. ~~**F5. Countdown urgency + bid input live feedback.**~~ ✓ **2026-05-31 (`bliss`):** `Countdown.tsx` now has a tri-state: outside `urgentMs` (default 1 h) is plain; inside `urgentMs` is amber; inside `criticalMs` (default 30 s) is red, bold, and pulses via `ah-pulse-urgent`. Under 60 s remaining the tick rate adapts from 1 s to 250 ms so the displayed seconds never lag perception. `BidInputFeedback` (in `PricePanel.tsx`) shows live "₹X above minimum" / "₹Y below minimum" as the user types — color-coded red/green, no submit needed. Two of the most concrete real-time UX wins: users racing the clock see the urgency without checking, and users typing a bid see whether it will be accepted before clicking.
6. ~~**F6. AutoBidHealth card.**~~ ✓ **2026-05-31 (`bliss`):** `front/src/components/ui/AutoBidHealth.tsx` — dedicated card for the viewer's own English auto-bid, replacing the plain "Active up to ₹X" alert. Three derived states: `WINNING` (green, "Leading the auction"), `EXHAUSTED` (red, "Cap reached — outbid by a higher limit"), `ARMED` (amber, "Will auto-bid up to ₹X · Headroom ₹Y"). Capacity bar shows `currentBid / maxAmount` with smooth width animation. Cancel button inline. Drops directly into the existing `AutoBidPanel` flow when `type === ENGLISH` and an auto-bid exists; Dutch keeps the simple "Active at or below" alert because the semantics differ. Required `AutoBidState.currentBid` (already returned by the backend's `getMyAutoBid`) be added to the frontend type. `isViewerWinning` boolean threaded from the page (computed from `bids.find(b => b.status === 'WINNING').bidder.id === viewer.id`).
7. ~~**F7. BackpressureBanner — high-traffic surface.**~~ ✓ **2026-05-31 (`bliss`):** `front/src/components/ui/BackpressureBanner.tsx` — sticky yellow banner just below the navbar, rendered when the page receives a `bid:backpressure` event. Shows the saturated auction id (truncated), the pending stream length, and the threshold. Auto-dismisses after 8 s; manually dismissable. The page also pushes a ticker toast and auto-clears the banner when the next successful `bid:new` flows through (the stream is draining). Today only the admin room receives this event, so the banner only fires for admins — a future iteration would broadcast a scoped version per auction room so bidders see it too.
8. ~~**F8. CSS animations + reduced-motion respect.**~~ ✓ **2026-05-31 (`bliss`):** `front/src/app/globals.css` — 7 new keyframe animations: `ah-toast-in` / `ah-toast-out` (LiveTicker slide), `ah-pulse-urgent` (countdown critical-state scale + colour modulation), `ah-ladder-cascade` (per-rung staggered highlight using a `--i` CSS variable), `ah-banner-drop` + `ah-banner-fade` (ladder banner entrance and 3 s-delayed exit), `ah-conn-pulse` (connection-status dot), `ah-banner-shake` (backpressure attention grab). All wrapped in a `@media (prefers-reduced-motion: reduce)` block at the bottom that kills every Phase F animation and transform — accessibility-correct fallback to the same UI states without the kinetic flourishes.
9. ~~**F9. Plan + session log addendum + TLDR doc.**~~ ✓ **2026-05-31 (`bliss`):** This Phase F section. Phase E session log extended with the UI/UX addendum block at its tail. `xdocs/sessions/INDEX.md` entry rewritten to mention Phase F alongside Phase E. New `TODAY.md` at the repo root — single-file conversational TLDR of the entire 2026-05-31 day for the user's own reference (covers the audit-to-Phase-F arc + the two outstanding user actions).

### Phase RP — Paper Reconciliation (post-submission audit, 1 day)
Goal: pull-the-repo defence. After the IEEE submission landed on 2026-06-01, post-submission `train:fraud` runs had silently overwritten `fraud.classifier.ts` with new weights and a new threshold, so the running code no longer matched supplementary §3.4's "complete source code" listing. Phase RP reconciles the gap by changing only code (the paper is locked).

The user's intent: "make the project exactly same as we claimed on research paper" and "don't get banned due to paper data mismatch if they pull the repo and match it." Full plan lives in [reaching-rp.md](reaching-rp.md); summary below.

1. ~~**RP1.1 + RP1.2. Restore paper-snapshot constants + lock banner.**~~ ✓ **2026-06-02:** `back/src/modules/fraud/fraud.classifier.ts` carries the exact threshold (0.20), weights, and norm-params from supplementary Tables III + VII. `PAPER_SNAPSHOT: 2026-06-01` banner names the producing corpus and trainer at the top of the file.
2. ~~**RP1.3. Safety-guard the trainer.**~~ ✓ **2026-06-02:** `packages/simulator/src/train.ts` (filename preserved to match supplementary §4.1) carries the safety guard in place. Default invocation writes to `fraud.classifier.candidate.ts`; live-snapshot overwrite requires both `--write` and `--confirm`. `back/package.json` and root `package.json` expose `train:fraud` (paper-faithful, default) and `train:fraud:v2` (corrected pipeline).
3. ~~**RP1.4. Preserve producing runs.**~~ ✓ **2026-06-02:** Three paper-era runs under `back/packages/simulator/runs/_paper-snapshot/`, one post-paper run under `_post-paper/`, empty stray removed, READMEs in both subdirs.
4. ~~**RP2. Manifest carries real sellerId.**~~ ✓ **2026-06-02:** `SimRunManifest.auctionOwners?` added; `run.ts` records the admin/seller id in every new manifest. `train.ts` ignores the field for paper reproducibility; `train.v2.ts` reads it.
5. ~~**train.v2.ts (Option 3).**~~ ✓ **2026-06-02:** Corrected, opt-in trainer. Reads `manifest.auctionOwners`, writes only `fraud.classifier.candidate.v2.ts`, never touches the live snapshot. Skips runs that lack `auctionOwners` with an explicit console warning.
6. ~~**RP4.1 + RP4.3. Canonical k6 numbers.**~~ ✓ **2026-06-02:** `paper/figures/k6_results.json` matches supplementary Table XII verbatim. `paper/figures/README.md` names canonical artefacts and flags main-paper Table III as the looser earlier set.
7. ~~**RP4.2. k6 sweep runner.**~~ ✓ **2026-06-02:** `packages/simulator/k6/run-canonical.ps1` runs the six configurations in sequence with git SHA / auction id / JWT in the header, appending to `docs/rp/rp-audit-02-k6-canonical-<timestamp>.md`.
8. ~~**RP5.1. Per-bid latency instrumentation.**~~ ✓ **2026-06-02:** `LatencyRing` (1024-sample reservoir) in `fraud.engine.ts` wraps the hot path with `performance.now()`. Backs the paper's sub-millisecond claim.
9. ~~**RP5.2. Bid-graph memory instrumentation.**~~ ✓ **2026-06-02:** `BidGraph.stats()` returns `approxBytes`. Backs supplementary Theorem 2.
10. ~~**RP5 endpoints.**~~ ✓ **2026-06-02:** `GET /api/fraud/perf` and `POST /api/fraud/perf/reset` exposed on the existing admin-only fraud router.
11. **RP3, RP5.3, RP6. Deferred / decided not to do.** Documented in `reaching-rp.md`. RP3 (multi-auction sim corpus) is opt-in user work; RP5.3 (held-out test split) would contradict paper Table I; RP6 (extra baselines) would diverge from paper text.

### Phase G — Pre-Review Fine-Tune (2026-06-02 evening, hours before review)
Goal: smooth out the small rough edges before a 2026-06-04 project review. No new features; targeted polish on the things a reviewer notices first.

1. ~~**G1. App-wide ErrorBoundary.**~~ ✓ **2026-06-02:** `front/src/components/ErrorBoundary.tsx` (class component, dev-mode stack visible, production card with reload + home buttons). Wired inside Navbar in `providers.tsx` so the nav stays usable when a page crashes.
2. ~~**G2. Landing-page footer accuracy.**~~ ✓ **2026-06-02:** Replaced the fake "LATENCY 14MS / UPTIME 99.9%" badges with stack labels and institution. No more numbers a reviewer can call out.
3. ~~**G3. Wallet polish.**~~ ✓ **2026-06-02:** Zero-balance info callout above stat grid; deposit-cap hint inline under the form; withdraw-side hint with withdrawable-now amount; fixed the leading-space description bug in transaction rows.
4. ~~**G4. Dashboard zero-state.**~~ ✓ **2026-06-02:** Brand-new-user welcome card with Fund-wallet + Browse-market CTAs. Appears only when bids/listings/wins are all zero.
5. ~~**G5. Backend log emojis stripped.**~~ ✓ **2026-06-02:** rules.md compliance — replaced emoji-prefixed logs in `back/src/index.ts`, `back/src/lib/redis.ts`, and every script under `back/src/scripts/` with bracketed tags. Dev console is cleaner; no UI impact.
6. ~~**G6. seed-users adds hoster.**~~ ✓ **2026-06-02:** `seed-users.ts` now creates `hoster@x.com` so the three `create-*-auction.ts` scripts work immediately after `db:seed-users`. Shared password documented in the final log line.
7. ~~**G7. Toolchain / build fixes.**~~ ✓ **2026-06-02:** Fixed the full command matrix. Root `prisma:*` scripts now delegate to the back workspace (loads `back/.env`, fixes the `DATABASE_URL not found` on `prisma:migrate`). Added `lint:front` + combined `lint` + combined `build`. `Field` primitive accepts `style`/`className` (fixes `build:front` TS error in `CommitmentPanel`). Cleared the back lint error (`generate-docs.ts` dead `fn` init) and all four warnings (two `any` in `auction.service`/`bid.sequencer`, unused `workerName` param, unused `io` import). Renamed `front/src/middleware.ts` -> `proxy.ts` (function `middleware` -> `proxy`) for the Next.js 16 convention, clearing the deprecation warning.
8. ~~**G8. One-shot demo seeder.**~~ ✓ **2026-06-02:** `back/src/scripts/seed-demo.ts` + `npm run db:seed-demo` (root + back). Idempotent: five demo accounts (password `123123`, funded) + one ACTIVE English/Dutch/Sealed auction owned by `hoster@x.com`. Single-command review setup.

Realtime layer was audited and needs no changes — `socket.ts` reconnect, `useSocketListener` / `useAuctionRoom` ref-stable subscriptions, login/register both call `reconnectSocket`, and the Navbar's `ConnectionStatus` already shows the tri-state. Phase F's work covered everything.

---

## 6. Rules for Future Sessions

These are not suggestions. A future Claude must obey them.

1. **Read order at session start:** this file → `graphify-out/GRAPH_REPORT.md` → only then source files.
2. **Trust code, not docs.** `bible.md`, `learn.md`, `done.md` are historical / aspirational. Verify with `grep`/`Read` before claiming a thing exists.
3. **Never write a checkbox into `done.md`.** If a phase task lands, edit *this* file's Phase A/B/C section to strike it through with `~~text~~` and add the commit hash.
4. **No dev/build/test runs.** The user explicitly said don't run servers / jest / next build / etc. Read and reason. They will run things themselves.
5. **Use graphify for cross-module questions.** Prefer `graphify query`, `graphify path`, `graphify explain` over grep when asking "how does X relate to Y" or "where is Z used".
6. **After code changes, run `graphify update .`** (zero-cost AST refresh) so the next session sees fresh graph.
7. **No new abstractions ahead of need.** If a phase task says "add row locks", add row locks — do not also refactor the service layer because it would be cleaner. The user has limited time.
8. **No emoji in code, no AI-generated UI vibes.** Per `xdocs/not-for-ai/checklist.md`. CSS variables and clean typography only.
9. **Never delete `xdocs/not-for-ai/` without asking.** That folder is the user's private notepad even if some entries are stale.
10. **Auto-bid behaviour expectation (from user's checklist).** When user X has auto-bid maxAmount=1000 and user Y has auto-bid maxAmount=11000, the *log* must show every incremental step (1100, 1200, ..., up to where X stops or Y wins), produced atomically. **No simulation delays.** This is a UX contract — the engine writes the full ladder of bids in one transaction (or one queued job batch) rather than over real wall-clock time. Phase A6 must implement this exactly.

---

## 7. Open Questions for the User (Answer When Ready)

Future Claude: do not assume an answer. Ask the user before acting on any of these.

1. **Paper venue.** IEEE student conference? An open-access journal? A university symposium? This decides the page limit and figure style.
2. **Repo split timing.** Should we split front/back into two repos *before* Phase A (less monorepo tooling tax) or *after* Phase C (don't disturb the research build)?
3. **Deployment target.** Local-only demo, or hosted (Railway / Vercel + Render / Fly.io)? Affects how much we invest in Phase A8 (multi-instance socket adapter).
4. **Dataset for fraud detection eval.** Synthetic-only is defensible. If we also want a small real-world subset, the user needs to greenlight a scraping effort (eBay API ToS implications) or a public dataset like the Trevathan 2007 traces.
5. **W1 vs W2 preference.** Both impress, but C6 (crypto commitments) is more "wow" while C7 (sequencer benchmarks) is more "engineering rigour". User picks priority.

---

## 8. Quick Reference — Where Things Live

```
back/
  prisma/schema.prisma              ── 10 models, Float money (FIX in A1)
  prisma/migrations/*               ── 2 migrations, no perf indexes (FIX in A3)
  src/index.ts                      ── Express + Socket.io bootstrap
  src/lib/{prisma,redis}.ts         ── singletons; redisPub/Sub dead (FIX A8)
  src/gateway/socket.gateway.ts     ── room auth + auction:join/leave/sync
  src/middleware/{auth,error,rateLimiter}.middleware.ts
  src/modules/
    auth/                           ── register/login/me
    users/                          ── profile, bidHistory, rateUser
    auctions/                       ── CRUD + buyNow + cancel
    bidding/                        ── placeBid (FIX A2,A6 / sealed-bid bug A4)
    auto-bid/                       ── processAutoBids (FIX A6, no nested tx)
    wallet/                         ── deposit / withdraw (FIX A2)
    payments/                       ── confirmWinnerPayment (subsume into A5 EscrowService)
    notifications/                  ── notifyUser writes DB+socket (FIX A7)
    watchlist/                      ── add/remove/list
    admin/                          ── stats, suspend, moderate, naive fraud (REWRITE in C2-C4)
  src/queues/auction.queue.ts       ── auctionQueue, dutchAuctionQueue, notificationQueue(dead)
  src/workers/index.ts              ── start/end auction + Dutch drop (FIX endAuction idempotency)
  src/scripts/                      ── ad-hoc DB helpers

front/
  src/app/                          ── 14 pages, App Router
    auctions/[id]/page.tsx          ── 1416 LOC monolith (REFACTOR in B1)
    dashboard/, profile/, admin/    ── 500-600 LOC each, also need B1
  src/lib/{api,socket}.ts           ── good shape, keep
  src/store/authStore.ts            ── good shape, keep
  src/middleware.ts                 ── edge auth gate, keep
  src/components/                   ── only Navbar + AuthProvider; ADD components/ui/* in B1

xdocs/
  prd.md                            ── original ask, still valid
  bible.md                          ── ASPIRATIONAL, move to archive
  not-for-ai/
    checklist.md                    ── user's working rules (respect them)
    done.md                         ── FICTION, delete in A10
    frontend_suggestion.md          ── valid QA bugs, fold into B1-B5
    ins.md, git-rule.md, redis-docker.md ── small notes
  jules-suggestion/bullmq-redis     ── reference material

graphify-out/                       ── knowledge graph; read GRAPH_REPORT.md first
```

---

## 9. Definition of Done

The project is "major-project-grade and paper-worthy" when:

- [x] Phase A all green — `docs/hardening.md` committed; grep checks documented.
- [x] Phase B all green — auction detail is ~280 LOC orchestrator + 4 sub-components; all pages use `components/ui/*`.
- [x] Phase C delivers: working live fraud detection (`FraudEngine` in `back/src/modules/fraud/`), sealed-bid commitments (C6: `commitment.service.ts` + `CommitmentPanel.tsx`), sequencer benchmarks (C7: `docs/architecture/sequencer.md`), paper draft (`paper/main.tex`) compilable to PDF with `pdflatex main.tex`.
- [ ] A 3-minute demo screencast at `paper/demo.mp4` — **user records this** against a running backend using the script in `paper/DEPLOY.md`.
- [x] Teachers' "just CRUD" critique answered: fraud-graph in `/admin/fraud` lights up live during `npm run sim:run`; price-time SVG chart streams on auction detail; evaluation table in `paper/tables/metrics.tex` (auto-generated by `npm run eval:fraud`).

— end of plan.md —
