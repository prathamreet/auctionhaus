# Session: 2026-05-28 — Audit & Plan

## Goal

User asked for a deep, honest analysis of the AuctionHaus monorepo and a master plan that future sessions can build from. Teachers had dismissed the project as "just CRUD"; user wanted to make it research-paper-worthy. Explicit ask: do NOT run dev/build/test, analyse + plan only, and write a `plan.md` that future sessions will read on every start.

## Context Loaded

- `CLAUDE.md` — graphify rules, currentDate 2026-05-28.
- `graphify-out/GRAPH_REPORT.md` and `graphify-out/wiki/index.md` — communities + god nodes.
- `back/src/index.ts`, `back/prisma/schema.prisma`, all `back/src/modules/*/*.service.ts`, `back/src/middleware/*`, `back/src/workers/index.ts`, `back/src/queues/auction.queue.ts`, `back/src/gateway/socket.gateway.ts`, `back/src/lib/redis.ts`.
- Frontend: `front/src/lib/{api,socket}.ts`, `front/src/store/authStore.ts`, `front/src/middleware.ts`, `front/src/app/globals.css`, `front/src/app/auctions/[id]/page.tsx` (sampled), file inventory and LOC counts for all pages.
- `xdocs/prd.md`, `xdocs/bible.md`, `back/learn.md`, `xdocs/not-for-ai/{checklist,done,frontend_suggestion,ins,git-rule}.md`.
- Verified docs-vs-code drift with targeted `grep` for `FOR UPDATE`, `Decimal`, `EscrowService`, `userCache`, `winston`, `redisPub/Sub`.

## Log

- Read graphify report — 124 files, 742 nodes, 94 communities. God nodes confirm `createError`, `useAuthStore`, `notifyUser`, `processAutoBids` are central.
- Found Float used for all money fields in `schema.prisma` despite docs claiming Decimal migration was done.
- Found `bid.service.ts` has no row locks despite `done.md` Phase 2.5 claiming `FOR UPDATE` was added.
- Found sealed-bid privacy bug: `select: { name: false }` is a Prisma no-op, bidder identities + amount-desc order leak the full ranking while live.
- Found `redisPub`/`redisSub` imported nowhere; Socket.io has no redis-adapter wired; this is part of why user perceives Redis as heavy.
- Found `notificationQueue` declared but never produced or consumed (pure dead code).
- Found `notifyUser` is awaited inside bid transactions — notifications on the critical path of bid commits.
- Found `auto-bid.service.ts::processAutoBids` calls `placeBid` recursively, and `placeBid` opens its own `prisma.$transaction` — nested interactive transactions are unsupported by Prisma.
- Found 1416-LOC monolith `front/src/app/auctions/[id]/page.tsx` with 121 inline style blocks and 17 useStates.
- Researched + picked primary research angle: real-time shill-bidding detection via online bid-graph analytics (streaming framing is the delta over Trevathan 2007 / Ford 2010 offline work).
- Picked two secondary wow features for paper/demo: cryptographic sealed-bid commitments and lock-free Redis-stream bid sequencer with throughput benchmarks.

## What Landed

- **`/plan.md`** — Master plan. Sections: North Star, Ground Truth, Doc-vs-Reality table, Concrete Bugs, Research Angle, Phased Roadmap (A: hardening, B: UI, C: research, D: defense), Rules for Future Sessions, Open Questions, Quick Reference, Definition of Done.
- **Archived AI-generated docs** to `xdocs/archive/` via `git mv` (preserved as renames in history):
  - `xdocs/bible.md` → `xdocs/archive/bible.md`
  - `back/learn.md` → `xdocs/archive/back-learn.md`
  - `xdocs/not-for-ai/done.md` → `xdocs/archive/done.md`
  - `xdocs/not-for-ai/frontend_suggestion.md` → `xdocs/archive/frontend_suggestion.md`
  - `xdocs/jules-suggestion/` → `xdocs/archive/jules-suggestion/`
- **`xdocs/archive/README.md`** — warning sign explaining the archived files are AI fiction and not to trust them.
- **`xdocs/sessions/{README,INDEX,_TEMPLATE,this-file}.md`** — session-memory protocol set up.
- **User memory** seeded at `~/.claude/projects/E--projects-auctionhaus/memory/` (8 atom files + MEMORY.md index) covering: project identity, no-dev-runs rule, no-emoji rule, plan.md-as-SSOT, doc drift finding, user role, graphify reference, auto-bid ladder UX contract.
- **`CLAUDE.md`** — to be updated next session-start with read-order including `xdocs/sessions/INDEX.md`. (Not yet edited this session; flagged in Next Up.)

## Open Questions

These are also captured in `plan.md` §7 — answer when ready:

1. Paper venue (IEEE conf? journal? university symposium?) — affects page count and figure style.
2. Repo split timing: before Phase A (less tooling tax) or after Phase C (don't disturb research build)?
3. Deploy target: local-only demo, or hosted? Affects priority of Phase A8 (Socket.io redis-adapter).
4. Fraud-eval dataset: synthetic-only fine, or pursue a small real subset (eBay scrape ToS risk vs Trevathan public traces)?
5. W1 (crypto commitments) vs W2 (sequencer benchmarks) priority — both fit but ranking helps.

## Next Up

Recommended starting point for next session: **CLAUDE.md update + Phase A1 (Decimal money migration)**.

- Action 1: Edit `CLAUDE.md` to add a step before graphify: "Read `/plan.md` then `xdocs/sessions/INDEX.md` and the most recent session log."
- Action 2: Begin Phase A1 from `plan.md`:
  - Files: `back/prisma/schema.prisma` (change `Float` → `Decimal @db.Decimal(18,2)` on Wallet.balance/heldAmount, Transaction.amount, Auction.startingPrice/reservePrice/currentPrice/buyNowPrice/dutchPriceStep/minIncrement, Bid.amount, AutoBid.maxAmount/currentBid).
  - Create `back/src/lib/decimal.ts` helper for serialization (Prisma Decimal → string for JSON, parse on input).
  - Touch every service that does arithmetic on these fields (`bid.service`, `wallet.service`, `auction.service`, `payment.service`, `auto-bid.service`, `workers/index.ts`).
  - Generate Prisma migration.
  - Acceptance: `grep "Float" back/prisma/schema.prisma` shows zero hits on money fields.
- Before starting A1, ask user whether to also tackle A2 (FOR UPDATE locks) in the same session, or split — A1 alone is already a large change.

## Notes for Future Self

- The user is in India, writes fast conversational English with Hinglish ("yaar"), and is on Windows + Docker-Redis. Match brevity. Don't over-format responses.
- `xdocs/not-for-ai/checklist.md` line about auto-bid ladder is a hard UX contract — see `plan.md` §6 rule 10 and the `project_autobid_ladder` memory file.
- Do not write to `xdocs/archive/`. If a future session wants to revive an archived doc, ask first.
- Do not write a parallel "done.md". Plan progress = strikethrough in `plan.md` + this session log.
- Auto-bid recursion crossing `prisma.$transaction` boundaries (`auto-bid.service.ts::processAutoBids` → `placeBid` → another tx) is a real bug; do not "preserve current behaviour" when refactoring — Phase A6 reworks this into a queue-driven flow.
- back/README.md still references `src/prisma/seed.ts` which does not exist; the actual seed scripts are at `back/src/scripts/`. Fix during Phase A11, not before.

---

## Continuation — Sealed-Bid Privacy Fix (small task, end-of-session)

User asked for one small concrete fix before closing. Picked Phase A4 (sealed-bid privacy leak) because it's a real bug, single-module scope, no schema/migration.

### What landed

- `back/src/modules/bidding/bid.service.ts`
  - Rewrote `getAuctionBids(auctionId, viewerId)`.
  - Now uses `select` (not `include`) so a stray field can't sneak in.
  - While SEALED_BID + ACTIVE: orders by `createdAt asc`, returns `amount: null` and `bidder: null` for everyone except the viewer's own bid. Viewer sees their own bid in full.
  - When ENDED or non-sealed: returns full bid data with bidder `{ id, name, avatar }`.
  - Added a JSDoc block documenting the privacy contract and what the previous bug was (the no-op `name: false`).
- `back/src/modules/bidding/bid.controller.ts`
  - `getAuctionBids` now passes `req.user!.id` as the viewerId.
  - `placeBid` socket emit is now conditional: while SEALED_BID + ACTIVE the `bid:new` payload omits `amount` and `bidderId` and carries `sealed: true`. Subscribers still see "a bid happened" so counters update, but they don't learn the price or who placed it.
  - Required adding an extra `prisma.auction.findUnique({ select: { type, status } })` inside `placeBid` to gate the emit. One extra small read per placed bid; negligible.
- `back/src/modules/bidding/bid.service.test.ts`
  - Both `getAuctionBids` tests were asserting the BUGGY behaviour (`name: false` and `amount desc`). Rewrote to assert the new contract: `createdAt asc` ordering, `select` (not `include`), masked amount/bidder for non-owner bids, viewer sees own bid in full.
- `plan.md` Phase A4 — struck through the part that landed, noted the remaining gap.

### What is NOT fixed in this session (follow-up)

- `back/src/modules/auctions/auction.service.ts::getAuctionById` still does `include: { bids: { take: 20, include: { bidder: { select: { id: true, name: true } } } } }`. This is the main detail-page fetch and **also** leaks bidder names + last-20 ordering for sealed+active auctions. Same fix pattern applies (DTO mask, conditional on type + status).
- Frontend has not been updated. `front/src/app/auctions/[id]/page.tsx::Bid` interface still types `amount: number` and `bidder: { id; name }` as non-nullable. For sealed+active auctions the API now returns `amount: null` / `bidder: null` for non-owner bids — the UI will crash on `.toLocaleString()` calls until that type is widened to `amount: number | null` etc. Easy fix; just out of scope for this small turn.

### Acceptance signal for the user to run

- `grep -n "name: false" back/src` — must return zero hits (was the bug marker).
- Run jest only when ready: `npm run test:back -- bid.service.test`. The two `getAuctionBids` tests should now assert the masking contract.

### Plan-doc edits

- `plan.md` Phase A4 strikethrough.
- This block.

### Commit

- `53215b1` on branch `bliss` — `chore(plan): plan.md as SSOT + fix sealed-bid privacy leak (Phase A4 partial)`. Includes the audit/plan setup, archive moves, sessions/ infrastructure, the bid module fix, the rewritten tests, and the graphify refresh. Not pushed (per rule: no git push without user ask).
- `e9a091c` — `docs(session): record commit hash in session log`.

---

## Continuation 2 — Close Phase A4 + small housekeeping

User had ~40% capacity left after the first commit and asked for more. Used it to fully close Phase A4 (no more partial state) plus a tiny doc fix.

### What landed

- **`back/src/modules/bidding/bid.service.ts`** — In `placeBid`, the unconditional `currentPrice: amount` write is now gated: SEALED_BID auctions get an empty update object (and the subsequent `tx.auction.update` is skipped entirely when nothing to write). This closes the leak that was bleeding via every API surface that returns `auction.currentPrice` (list page, detail page, the `auction:state` socket sync) — sealed-active auctions now stay at `startingPrice` until they end.
- **`back/src/modules/auctions/auction.service.ts`** — `getAuctionById` now filters the embedded `bids[]` include down to the viewer's own bid only when sealed+ACTIVE. The detail-page back-door is closed.
- **`back/src/modules/auctions/auction.service.test.ts`** — added two tests locking the new behaviour: (a) sealed+ACTIVE strips other bidders' rows, (b) sealed+ENDED returns the full list. Removed the now-incorrect `eslint-disable-next-line @typescript-eslint/no-unused-vars` since AuctionStatus + AuctionType are now actually used.
- **`front/src/app/auctions/[id]/page.tsx`** — `Bid` interface widened to `amount: number | null`, `bidder: { id; name?; avatar? } | null`. Render code at lines 561, 614, 635 was already optional-chained with `"[SEALED]"` / "Hidden" fallbacks, so no UI logic change was needed — only the type. Checked dashboard/page.tsx (uses `bid.amount?.toLocaleString()`) and other consumers; all are null-safe.
- **`back/README.md`** — removed the stale `src/prisma/seed.ts` reference and the `npm run prisma:seed` command (neither exists). Replaced with the real `npm run db:seed-users` and the ad-hoc `src/scripts/create-*-auction.ts` files.
- **`plan.md`** Phase A4 — fully struck through with summary of what landed and a check-mark.

### Acceptance signals for the user to run

- `grep -rn "name: false" back/src` → 0 hits. (Was the original bug marker.)
- `grep -n "currentPrice: amount" back/src/modules/bidding/bid.service.ts` → must show the gated form (`auction.type === AuctionType.SEALED_BID ? {} : { currentPrice: amount }`).
- `npm run test:back -- bid.service.test` → 2 sealed-bid tests pass.
- `npm run test:back -- auction.service.test` → 2 new sealed-mask tests pass.
- Eyeball: open a sealed auction in two browser tabs as different users. Bidder A places a bid. Bidder B opens `/auctions/{id}`: should see "[PRIVATE] N Sealed Bids" with no amount or identity, and the bid-history row should show "[SEALED]" / "Hidden". Bidder A should see their own ₹X back.

### What is still NOT fixed (intentional, deferred)

- Auto-bid logic on sealed bids is still broken at a higher level — `processAutoBids` is gated by `auction.status === ACTIVE` but its math uses `currentPrice + minIncrement`, which is meaningless for sealed bids where `currentPrice` no longer increments. In practice this means setting an auto-bid on a sealed auction either no-ops (since `topAutoBid.maxAmount < startingPrice + minIncrement` will fail) or triggers wrong placements. The right call is to reject `setAutoBid` for SEALED_BID auctions at the validation layer. Not done in this session — flagged here for Phase A6.
- The `setAutoBid` validation in `auto-bid.service.ts` checks Dutch and "else" (English) branches but does not have a SEALED_BID branch. Same fix-site as the auto-bid sealed-handling above.

### Plan-doc edits

- `plan.md` Phase A4 fully struck through with implementation note and commit refs.
- This continuation block.

### Commit

- `6a90b54` on branch `bliss` — `fix(sealed-bid): close Phase A4 -- stop currentPrice leak, mask detail-page bids, widen FE type`. 8 files changed, 118 insertions, 11 deletions. Not pushed.
- `d4c4d11` — `docs(session): record 6a90b54 hash in session log`.

---

## Continuation 3 — Phase A2 (FOR UPDATE locks) + sealed auto-bid guard

User had ~30% capacity left after Phase A4. Used it to close Phase A2 entirely (real concurrency fix, the actual race conditions the audit found, the whole point of "make it bullet-proof").

### Global lock order (new invariant — every code path now obeys this)

Within any `prisma.$transaction`:
1. Lock the auction row first (`SELECT id FROM auctions WHERE id = $1 FOR UPDATE`).
2. Then lock wallets in **ascending userId order** to prevent deadlock.

Five entry points updated to obey this:
- `bid.service.placeBid`
- `auction.service.buyNow`
- `payment.service.confirmWinnerPayment`
- `workers/index.ts::endAuction`
- `wallet.service.withdraw` (only locks a single wallet — no ordering concern)

### What landed

- **`back/src/modules/bidding/bid.service.ts::placeBid`** — Added a pre-validation lock acquisition: auction row + bidder wallet + (English only) previous winner's wallet if different from bidder, sorted by userId. Reads the previous winner via a small `select: { bidderId: true }` lookup before doing the lock sort so the lock-order is deterministic. Existing flow (validate, hold, create bid, update auction) runs unchanged under the locks.
- **`back/src/modules/wallet/wallet.service.ts::withdraw`** — Wrapped the entire flow in `prisma.$transaction` (was previously NOT in a tx — concurrent withdrawals could both pass the available-balance check). Added `FOR UPDATE` on the wallet row. Now `available = balance - heldAmount` is read against a row no other writer can touch.
- **`back/src/modules/auctions/auction.service.ts::buyNow`** — Status check, buyer validation, and wallet balance check **moved inside** the existing `$transaction`. Pre-tx race window eliminated. Added auction lock + both wallet locks (ascending order). Cleaned up the `auction.buyNowPrice!` non-null assertions inside the tx since the guard happens earlier in the same scope.
- **`back/src/workers/index.ts::endAuction`** — Wrapped the auction-lookup + status-flip in a tx with `FOR UPDATE`. BullMQ can re-deliver jobs (worker crash, stalled-job recovery); two simultaneous `endAuction` runs would have both read `status !== ENDED` and both proceeded. Now the loser waits, sees `ENDED`, and bails. Used a destructured return object (`{ committed, auctionSnap, winningBid, winner, metReserve }`) so the post-settlement work (sealed-loser refunds, socket emit, notifyUser) stays outside the lock. The state flip to `ENDED` is the idempotency barrier.
- **`back/src/modules/payments/payment.service.ts::confirmWinnerPayment`** — Moved the existing-payment idempotency check inside the locked tx (was outside, racy). Added auction lock + both wallet locks. The "already processed" early return still works because we ARE inside the tx by then.
- **`back/src/modules/auto-bid/auto-bid.service.ts::setAutoBid`** — Free-rider Phase A4 follow-up: reject `setAutoBid` on `SEALED_BID` auctions with a 400. The math relies on `currentPrice + minIncrement` ladder, but A4 froze `currentPrice` for sealed auctions, so an auto-bid would either no-op or fire wrong. Better to fail loud.
- **`back/src/__mocks__/prisma.ts`** — Global jest mock defaults so existing tests don't need per-file patches:
  - `$queryRaw` default returns `[{ id: '_locked_' }]` (lock acquired, one row). Tests can override with `mockResolvedValueOnce([])` to simulate "row not found".
  - `$transaction` default invokes its callback with `prismaMock` (for interactive form) and `Promise.all` for the batched-array form. Per-file `mockImplementation` overrides still work.
- **`back/src/modules/auto-bid/auto-bid.service.test.ts`** — Added one test locking the sealed-rejection contract.
- **`plan.md`** Phase A2 fully struck through with implementation note + acceptance signal.

### Acceptance signals for the user to run

- `grep -n "FOR UPDATE" back/src/modules` — should show 5 hits across `bid.service.ts`, `wallet.service.ts`, `auctions/auction.service.ts`, `payments/payment.service.ts`, plus 1 in `workers/index.ts`.
- `npm run test:back` — full suite. The 8 tests touched (placeBid 4, getAuctionBids 2, withdraw 3, buyNow 2, getAuctionById 4, confirmWinnerPayment 5, setAutoBid 7 incl. new sealed) should all pass with no per-test edits required, thanks to the mock defaults.
- Realistic concurrency check (when the user is ready): fire 50 concurrent bids via k6 against a freshly-seeded ENGLISH auction. After the run, `SELECT amount, COUNT(*) FROM bids WHERE "auctionId" = '<id>' GROUP BY amount HAVING COUNT(*) > 1;` must return zero rows. Without the locks, this query would have returned duplicates.

### Plan-doc edits

- `plan.md` Phase A2 struck through.
- This continuation block.

### Known follow-ups (not touched this session)

- Phase A1 (Decimal money) — still queued. The locks won't help if the arithmetic itself drifts due to IEEE-754.
- Phase A3 (indexes) — Auction.status / endTime / type, Bid(auctionId, status), Notification(userId, isRead) are still missing.
- Phase A6 (auto-bid via queue) — `processAutoBids` still recurses through `placeBid` which opens its own tx; the nested-tx issue persists. Phase A2 made the bug more visible (each recursion now also tries to acquire FOR UPDATE on the same auction — Postgres will see the same backend already holds the lock and proceed, but the throughput cost grows).
- Phase A4 had one tiny remaining edge: `notifyUser` is `await`ed inside `payment.service.confirmWinnerPayment`'s tx. Phase A7 (notifications queue) will fix this properly.
- emoji in `workers/index.ts:204` notification title — not strictly in-scope; flag for cleanup.

### Next Up (revised)

1. **Phase A1 — Decimal money migration.** Now the *only* remaining "money is broken" failure mode. Mechanical but multi-file; needs `prisma migrate dev` which the user runs.
2. **Phase A3 — Add B-tree + GIN indexes.** Pure migration SQL, no code. Same prisma-migrate gate as A1.
3. **Phase A6 — Auto-bid queue refactor + atomic ladder log.** The most user-visible change of Phase A; also makes the auto-bid behaviour match the UX contract in `xdocs/not-for-ai/checklist.md`.

### Commit

- `1dffd89` on branch `bliss` — `fix(concurrency): Phase A2 -- FOR UPDATE locks across the 5 hot paths`. 11 files changed, 315 insertions, 106 deletions. Not pushed.

---

## SESSION CLOSED — Where We Are Leaving (read this first next session)

This is the canonical summary. If you (future Claude) only read one block in this file, read this one. Then jump to `## Next Up (revised)` above for the queued action list.

### Branch state

- Working branch: `bliss` (current `HEAD` was `c641846` at close; one more graphify-refresh commit comes after this edit).
- Working tree clean except `.claude/` (local agent state, ignored).
- Nothing pushed. User pushes when they want.
- Recent commit ladder (oldest to newest in this session):
  - `53215b1` plan.md as SSOT + sealed-bid partial fix
  - `e9a091c` record hash
  - `6a90b54` close Phase A4 (sealed-bid privacy end-to-end)
  - `d4c4d11` record hash
  - `1dffd89` Phase A2 (FOR UPDATE locks across 5 hot paths)
  - `c641846` record hash
  - (this commit) docs(session): close session + graphify refresh

### What is now true about the codebase (vs the 2026-05-28 audit start)

The "doc-vs-reality" gap from `xdocs/archive/done.md` is partially real now (genuinely landed in TypeScript, not just markdown):

| Audit-day claim that was fiction | Status now |
| --- | --- |
| `FOR UPDATE` row locks in placeBid, withdraw, endAuction, buyNow | **REAL** in `bid.service`, `wallet.service`, `auction.service::buyNow`, `workers/index.ts::endAuction`, `payment.service::confirmWinnerPayment` |
| Sealed-bid privacy mask via DTO | **REAL** in `bid.service.getAuctionBids`, `bid.controller.placeBid` socket emit, `bid.service.placeBid` (currentPrice no longer updates), `auction.service.getAuctionById` (bids[] masked) |
| Decimal money | **STILL FAKE** — Float everywhere. Phase A1. |
| Indexes on Auction.status / endTime / type, Bid(auctionId,status), Notification(userId,isRead) | **STILL FAKE** — only unique constraints exist. Phase A3. |
| EscrowService centralization | **STILL FAKE** — settlement logic still split. Phase A5. |
| In-memory userCache | **STILL FAKE** — every authed request hits DB. Phase A9. |
| Socket.io Redis adapter wired | **STILL FAKE** — `redisPub`/`redisSub` still imported nowhere. Phase A8. |
| Auto-bid via BullMQ queue (atomic ladder log) | **STILL FAKE** — still recursive setImmediate. Phase A6. |
| Winston logger / financial.log | **STILL FAKE** — `console.error` everywhere. |

So: of the docs-vs-reality table in `plan.md §2`, rows for **FOR UPDATE locks** and **sealed-bid privacy** are now genuinely satisfied. Everything else in that table is still fake and must be done in actual code, not docs.

### Lock-order invariant (memorize this, it's permanent)

Within any `prisma.$transaction` that touches auctions + wallets, the order is:

1. `SELECT id FROM auctions WHERE id = $1 FOR UPDATE`  — auction first, always.
2. `SELECT id FROM wallets WHERE "userId" = $1 FOR UPDATE`  — wallets second, **in ascending userId order** when locking more than one.

Any new code path that touches money MUST obey this order or it deadlocks. Add the same `for (const uid of [...].sort()) { await tx.$queryRaw\`...\`; }` pattern.

### Test-mock conventions (Phase A2)

`back/src/__mocks__/prisma.ts` now sets two defaults in its `beforeEach`:

- `$queryRaw` → resolves to `[{ id: '_locked_' }]` so the lock-acquire path is transparent in tests. To simulate "row not found" in a single test, override with `prismaMock.$queryRaw.mockResolvedValueOnce([])`.
- `$transaction` → invokes its callback with `prismaMock` (interactive form) or `Promise.all`s its array argument (batched form). Per-file `mockImplementation` overrides still work; they win.

When adding new tests for locked code paths, do NOT need to set up `$queryRaw` or `$transaction` unless your test specifically wants different semantics.

### How to resume in a fresh session

Step-by-step, no thinking required:

1. Open this file (`xdocs/sessions/2026-05-28-audit-and-plan.md`), read this block + `## Next Up (revised)`.
2. Open `plan.md` §5 (Phased Roadmap). Phase A1, A3, A6 are the next actions; A4 and A2 are struck through.
3. Open `xdocs/sessions/INDEX.md` to confirm no newer session started in between.
4. **If user says "continue" without naming a phase:** start Phase A1 (Decimal money migration). It's mechanical and unblocks A6.
5. **If user names a phase:** do that one. The plan.md entry tells you the files and acceptance signal.
6. Before editing code, scan `graphify-out/GRAPH_REPORT.md` for the relevant community. (Refreshed at session close — 1056 nodes / 1297 edges / 127 communities. God nodes now also include the new lock-acquisition patterns.)

### Phase A1 (Decimal money) — pre-flight notes for next session

- Files to change (every Float money field):
  - `back/prisma/schema.prisma` — Wallet.balance, Wallet.heldAmount, Transaction.amount, Auction.startingPrice/reservePrice/currentPrice/buyNowPrice/dutchPriceStep/minIncrement, Bid.amount, AutoBid.maxAmount/currentBid. Use `Decimal @db.Decimal(18, 2)`.
  - Add `back/src/lib/decimal.ts` — helper that (a) parses incoming `number` from Zod into `Decimal` and (b) serializes `Decimal` → string in API responses. Prisma returns Decimal as a `Decimal.js` instance; JSON.stringify of that gives `{"s":1,"e":..., "d":[...]}` which the frontend can't parse. Use a Prisma transformer or a manual mapping in each service return.
  - Update every service that does arithmetic. The dangerous ones:
    - `bid.service.placeBid` — `auction.currentPrice + auction.minIncrement`, `wallet.balance - wallet.heldAmount`, the `< amount` check, etc.
    - `wallet.service.withdraw` — same available-balance subtraction.
    - `auction.service.buyNow` — `wallet.balance < auction.buyNowPrice`.
    - `payment.service.confirmWinnerPayment` — `Math.abs(Number(existingPayment.amount))`.
    - `auto-bid.service` — `currentPrice + minIncrement`, `topAutoBid.maxAmount + minIncrement`.
    - `workers/index.ts::endAuction` — sealed-loser refund aggregation `refunds[uid] += loser.amount`.
  - JS `+` / `-` / `<` on Decimal objects is a footgun. Use `.add()`, `.sub()`, `.lt()`, `.gt()`. Add an ESLint rule if possible, or at minimum a comment marker.
  - Acceptance: `grep -n "Float" back/prisma/schema.prisma` returns zero on money fields.
- The migration `prisma migrate dev --name decimal_money` is **user-run**. Do not run it. After the user confirms migration applied, the code change works.
- Tests will need spot updates wherever they mock numeric balances. Use `new Prisma.Decimal(100)` instead of `100`. The `prismaMock` doesn't care about the type so most tests just keep working.

### Phase A3 (Indexes) — pre-flight notes

- Pure migration. Make a new file under `back/prisma/migrations/<timestamp>_perf_indexes/migration.sql` with:
  ```sql
  CREATE INDEX "auctions_status_idx" ON "auctions"("status");
  CREATE INDEX "auctions_endTime_idx" ON "auctions"("endTime");
  CREATE INDEX "auctions_type_status_idx" ON "auctions"("type", "status");
  CREATE INDEX "bids_auctionId_status_idx" ON "bids"("auctionId", "status");
  CREATE INDEX "bids_bidderId_idx" ON "bids"("bidderId");
  CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
  CREATE INDEX "transactions_userId_createdAt_idx" ON "transactions"("userId", "createdAt" DESC);
  CREATE INDEX "auctions_title_description_fts_idx" ON "auctions"
    USING GIN (to_tsvector('english', "title" || ' ' || "description"));
  ```
- Then update `auction.service.getAuctions` to use `to_tsvector` FTS instead of ILIKE `contains` for the `search` param. Same for `admin.service.getAllUsers` (if matching the same pattern).
- Schema additions in Prisma: add `@@index([...])` directives for parity, but the GIN one will need to live only in the manual SQL.

### Phase A6 (Auto-bid queue + atomic ladder log) — pre-flight notes

- The UX contract in `xdocs/not-for-ai/checklist.md` and `~/.claude/projects/E--projects-auctionhaus/memory/project_autobid_ladder.md` is: when bidder A maxAmount=1000 fights bidder B maxAmount=11000, the bid log must show every step (1100, 1200, ..., until A drops out) as instant entries, no wall-clock simulation.
- Refactor: introduce a new BullMQ queue `auto-bid` with concurrency 1 per auction (use BullMQ's `groupKey`). Producer is `bid.controller.placeBid` (replaces the current `setImmediate`). Worker consumes `{ auctionId, triggerBidderId, triggerAmount }` and runs the full ladder in a **single** `prisma.$transaction`, locking the auction once, walking the auto-bidders in priority order, inserting every intermediate `Bid` row synchronously within the tx.
- The current recursive `processAutoBids → placeBid → another tx` pattern is the main thing to delete. It's what makes nested transactions and breaks the ladder contract.
- This is the most user-visible change of the whole hardening phase.

### Phase A7 (Notifications queue) — quick win

- The declared-but-dead `notificationQueue` in `back/src/queues/auction.queue.ts` should be wired up: `notifyUser` (in `back/src/modules/notifications/notification.service.ts`) currently does DB write + socket emit synchronously inside other modules' transactions. Switch to `notificationQueue.add('deliver', { userId, type, title, message, data })`. Worker writes to DB then emits. Removes notifications from every bid/payment critical path.

### Phase A8 (Socket.io Redis adapter) — quick win

- `redisPub` and `redisSub` are already exported and unused. In `back/src/index.ts` after `const io = new Server(...)`, add:
  ```ts
  import { createAdapter } from '@socket.io/redis-adapter';
  io.adapter(createAdapter(redisPub, redisSub));
  ```
- Needs the `@socket.io/redis-adapter` dep added to `back/package.json`. After this, the dead connections do real work and the "your Redis is heavy" feeling has a real payoff (horizontal scaling).

### Phase B (UI) is intentionally deferred

Phase A1, A3, A6, A7, A8 are the next backend deliverables. Phase B starts only after Phase A is done. Do not interleave UI work into Phase A turns unless the user explicitly asks.

### Things to never forget about this project

- User runs all servers, builds, jest, migrations themselves. Never run `npm run dev`, `next build`, `jest`, `prisma migrate dev`. Static analysis (lint, grep, graphify) is fine.
- No emojis in code (one stray emoji in `workers/index.ts:204` is a follow-up cleanup, not a current ask).
- Do not write to `xdocs/archive/` — those files are kept only to prove the doc-vs-code drift to anyone (including the user) who comes back later wondering "what happened to bible.md".
- Do not write a parallel `done.md`. Plan progress = strikethrough in `plan.md` + a continuation block in the session log.
- The lock-order invariant is permanent. Any new money-touching code path goes auction-first, then wallets in ascending userId order.

### Final commit (after this edit)

- `c641846` was the previous tip. The next commit closes the session: refreshes `graphify-out/` (1056 nodes / 1297 edges / 127 communities) and records this closing block.

### Next Up (revised, supersedes earlier Next Up)

1. **Phase A1 — Decimal money migration.** `back/prisma/schema.prisma` Float → `Decimal @db.Decimal(18,2)` on every money field, add `back/src/lib/decimal.ts` for JSON serialization, update every service that does arithmetic, generate the migration. Multi-file but mechanical. User should ack before starting because it requires `prisma migrate dev` which they will run themselves.
2. **Quick win en route**: while editing `auto-bid.service.ts` for Phase A1's currency types, add the `if (auction.type === AuctionType.SEALED_BID) throw createError('Auto-bid not supported on sealed auctions', 400);` guard noted above.
3. **Then Phase A2** — `FOR UPDATE` row locks in placeBid, withdraw, endAuction, buyNow.

### Next Up (overrides earlier Next Up section)

1. **Frontend type widen**: in `front/src/app/auctions/[id]/page.tsx` change `Bid.amount` to `number | null`, `Bid.bidder` to `{ id: string; name: string } | null`, then guard renders that call `.toLocaleString()` / `.name` with a sealed-bid placeholder ("Bid placed — amount hidden until close"). 10 minutes of work.
2. **Finish Phase A4**: rewrite `auction.service.getAuctionById` to apply the same masking pattern when sealed+active. Same shape as `bid.service.getAuctionBids`: build a DTO instead of leaking via include.
3. Then move on to Phase A1 (Decimal money) as planned.
