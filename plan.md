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
3. ~~**A3. Add indexes.** Migration adds B-tree on `Auction(status)`, `Auction(endTime)`, `Auction(type, status)`, `Bid(auctionId, status)`, `Bid(bidderId)`, `Notification(userId, isRead)`, `Transaction(userId, createdAt)`. Add GIN on `to_tsvector(title || ' ' || description)` and switch `getAuctions` search to FTS.~~ ✓ **2026-05-28 (same commit as A1):** Every B-tree index listed above is in `back/prisma/migrations/20260528000001_perf_indexes/migration.sql` with matching `@@index([...])` directives in `schema.prisma` (parity). The GIN tsvector(title || ' ' || description) index lives only in raw SQL — Prisma can't express tsvector — and is documented in a schema comment on the Auction model. **Deferred:** the actual `getAuctions` search rewrite from ILIKE → `to_tsvector @@ plainto_tsquery(...)` is not done in this commit — the index is in place so the rewrite is a one-query change in a follow-up.
4. **A4. Fix sealed-bid privacy.** ~~Replace the broken `name: false` with an explicit DTO that omits bidder identity *and* randomizes order while live.~~ ✓ **2026-05-28 (commits `53215b1` + this session's `bliss` HEAD):** `bid.service.getAuctionBids` returns `amount: null` + `bidder: null` for non-owner bids under sealed+ACTIVE, ordered by `createdAt asc`; `bid.controller.placeBid` redacts the `bid:new` socket payload (omit amount + bidderId, mark `sealed: true`); `bid.service.placeBid` no longer updates `auction.currentPrice` for SEALED_BID (closes the leak via every API and `auction:state` socket response); `auction.service.getAuctionById` filters embedded `bids[]` to the viewer's own entry only while sealed+ACTIVE; frontend `Bid` type widened to `amount: number | null`, `bidder: {...} | null` (render code was already null-safe). Tests added in both `bid.service.test.ts` and `auction.service.test.ts` to lock in the contract.
5. **A5. EscrowService.** One module that owns "settle this auction" — called from `buyNow`, `placeBid` Dutch path, `workers/endAuction`. Idempotent via a `Settlement` row uniqued on `auctionId`. Replaces the three current copies of payout logic.
6. **A6. Auto-bid via queue.** Stop calling `placeBid` recursively inside a transaction. Replace `setImmediate` in [bid.service.ts:180](back/src/modules/bidding/bid.service.ts) with `autoBidQueue.add('resolve', { auctionId })`. A dedicated worker consumes one job at a time per auction key (BullMQ `groupKey`).
7. **A7. Wire `notificationQueue`.** Move `notifyUser` writes off the request path into this queue. Worker writes to DB then emits socket.
8. **A8. Socket.io horizontal-scaling adapter.** Wire `@socket.io/redis-adapter` using the already-allocated `redisPub`/`redisSub` so the cluster story is real (and the connections stop being dead weight). Even if you only run one instance, this earns marks.
9. **A9. In-memory user cache in auth middleware.** Map<userId, {user, ts}> with 30s TTL + Redis pub `user:invalidate` channel for suspend events.
10. **A10. Delete `xdocs/not-for-ai/done.md`** (it is fiction). Move `bible.md` and `learn.md` to `xdocs/archive/` and regenerate from code via a script (see A11).
11. **A11. Replace handwritten docs with code-derived `docs/`.** A small script reads Prisma + Zod + route definitions and produces `docs/api.md` and `docs/schema.md`. Then the graph in `graphify-out/` is the only narrative doc.

### Phase B — UI Layer People Notice (1–2 weeks)
Goal: open the app and the teacher says "oh."

1. **B1. Extract design system.** Create `front/src/components/ui/{Button,Input,Select,Card,Badge,Skeleton,EmptyState,Stat,Chart}.tsx` and convert at minimum the auctions list, auction detail, and dashboard pages to use them. Delete the inline `style={{}}` blocks they replace.
2. **B2. Auction-detail bid chart.** Add `recharts` (or visx). Show a price-vs-time line with bid dots; toggle to volume bars. Subscribes to `bid:new` and prepends live.
3. **B3. Live admin fraud dashboard.** Page at `/admin/fraud` showing the bid-graph (force-directed layout via `react-force-graph-2d`), a feed of flagged events, and a confusion-matrix card from the offline eval.
4. **B4. Skeletons.** Replace every "Loading…" string with a layout-matched skeleton.
5. **B5. Form validation via Zod + react-hook-form.** Share Zod schemas with the backend by exporting a small `@auctionhaus/contracts` package (drop it in `packages/contracts/` and update workspaces).
6. **B6. `useSocketListener(event, fn)` hook.** Replace the repeated `getSocket().on(...) + return () => off(...)` pattern in every page with a single hook.
7. **B7. Visual polish pass.** Two themes (light + dark) via CSS variables that already exist. A real landing page.

### Phase C — Research Build (4–6 weeks)
This is the paper.

1. **C1. Synthetic-bidder simulator.** `packages/simulator/` Node app with agent personas (truthful, sniper, shill cluster, collusion ring). Spawns Socket+REST clients against the live backend. Outputs a `runs/{ts}/events.jsonl` log + a metadata manifest of the ground-truth labels.
2. **C2. Stream feature extractor.** `back/src/modules/fraud/` subscribes to `bid:new` events (in-process pub or Redis stream). Maintains a sliding-window graph (e.g., `graphology`), emits feature vectors per bidder-per-auction.
3. **C3. Classifier service.** Train an XGBoost / LightGBM model offline on simulator logs; serve predictions via a small Python sidecar (FastAPI) or in-process ONNX. Decide per-architecture preference once you've benchmarked latency.
4. **C4. Admin UX.** B3 dashboard now consumes real `fraud:flag` events with confidence scores. Admin can "ignore", "warn", "void bid", "suspend user".
5. **C5. Eval harness.** Script that runs the simulator with known labels, captures fraud flags, computes precision/recall/F1, ROC, per-feature ablation. Writes `paper/figures/*.png` and `paper/tables/*.tex`.
6. **C6. W1 commitments.** Add `BidCommitment { id, auctionId, bidderId, commitHash, createdAt, revealedAt?, revealedAmount?, revealedNonce? }`. New endpoints: `POST /api/bids/.../commit`, `POST /api/bids/.../reveal`. New frontend flow for sealed-bid pages.
7. **C7. W2 sequencer.** Per-auction Redis Stream consumer. Document the protocol in `docs/architecture/sequencer.md`. Benchmark in C5.
8. **C8. Paper draft.** 6–8 page IEEE template in `paper/`. Sections: intro, related work, system design (uses the Mermaid/PlantUML auto-rendered from graphify), method, evaluation, threats to validity, conclusion. Plus a 1-page poster.

### Phase D — Polish & Defense (1 week before viva)
- Record a 3-minute screencast walking through a live shill-detection event.
- Rehearse three questions: "why decimal not float?", "what's the race condition you fixed?", "what's the novelty vs prior work?" — each in 60 seconds.
- Split into two repos (`auctionhaus-front`, `auctionhaus-back`) for deploy. Keep a tiny meta repo with this `plan.md` and the paper.

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

- [ ] Phase A all green (verifiable via grep + a 1-page hardening report committed to `docs/hardening.md`).
- [ ] Phase B all green (the auction detail page is under 400 LOC and uses components/ui).
- [ ] Phase C delivers: working live fraud detection, sealed-bid commitments OR sequencer benchmarks, paper draft compilable to PDF.
- [ ] A 3-minute demo screencast exists at `paper/demo.mp4`.
- [ ] The teachers' "just CRUD" critique is answered by: a live fraud-graph lighting up during a scripted collusion, a price-time chart streaming during a bid, and an evaluation table in the paper. That is the deliverable difference.

— end of plan.md —
