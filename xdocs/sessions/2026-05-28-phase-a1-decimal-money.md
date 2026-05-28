# Session: 2026-05-28 — Phase A1 Decimal Money

## Goal

User said "continue where u left, read all md files and start completing". Per the closing block of the previous session log, when the user says "continue" without naming a phase the queued action is **Phase A1 — Decimal money migration**: switch every money field in `prisma/schema.prisma` from `Float` to `Decimal @db.Decimal(18,2)`, add a `lib/decimal.ts` helper, update every service that does money arithmetic, and write the migration SQL (the user applies it themselves).

## Context Loaded

- `/plan.md` §5 Phase A pre-flight notes (re-read).
- `xdocs/sessions/INDEX.md` (only previous entry is the audit-and-plan session).
- `xdocs/sessions/2026-05-28-audit-and-plan.md` § "SESSION CLOSED" + § "Phase A1 pre-flight notes".
- `back/prisma/schema.prisma` (10 models — money fields identified).
- `back/prisma/migrations/{20260219171445_init, 20260512113740_}` for the SQL pattern used by the project.
- `back/src/__mocks__/prisma.ts` (Phase A2 mock defaults already in place).
- All money-arithmetic source: `bid.service.ts`, `wallet.service.ts`, `auction.service.ts` (createAuction, buyNow, cancelAuction, getAuctionById), `payment.service.ts`, `auto-bid.service.ts`, `workers/index.ts`.
- All money-arithmetic tests: `bid.service.test.ts`, `wallet.service.test.ts`, `auction.service.test.ts`, `payment.service.test.ts`, `auto-bid.service.test.ts`.
- Controllers (Zod parse boundary): `bid.controller.ts`, `wallet.controller.ts`, `auction.controller.ts`, `auto-bid.controller.ts`, `payments` controller.

## Strategy

**Why a hybrid number-in / Decimal-internal / number-out approach instead of full end-to-end Decimal:**

1. Postgres column type becomes `NUMERIC(18,2)` — the actual storage is exact. No drift even after years of arithmetic. This is the value Phase A1 was meant to capture.
2. Prisma maps that to `Prisma.Decimal` (a `decimal.js` instance). Services do all arithmetic via `.add()`, `.sub()`, `.lt()`, `.gt()`, `.cmp()` so no IEEE-754 footgun in the business logic.
3. Zod controllers still accept `z.number()` — clients send `{ amount: 100 }`. Services build a `Decimal` from that number at the top of the function. JS Number → Decimal is safe up to 2^53 cents.
4. **API responses convert Decimal → number** via a `serialize()` helper at every `res.json` / `socket.emit` boundary. JS Number can represent all 2-decimal values up to ~9 × 10^13 exactly, so display precision is preserved.
5. Frontend keeps `amount: number` — no breaking type changes, no `.toLocaleString()` rewrites.

Trade-off: this is not "Decimal end-to-end". It is "Decimal where it matters" (storage + service arithmetic). The float-drift bug is gone. The cost is one converter at the edge.

The user runs `prisma migrate dev` themselves — we write the migration SQL manually under a fresh timestamp folder.

## Log

- Decided strategy above.
- Created task list (13 tasks) to track the multi-file scope.
- Verified `Prisma.Decimal` is `decimal.js` and `JSON.stringify` calls `.toJSON()` → string. But the response strategy keeps numbers anyway (one boundary serialize call vs. updating every `.toLocaleString` in the FE).

## What Landed

### Schema + migration (user runs `prisma migrate dev`)

- `back/prisma/schema.prisma` — every money field switched from `Float` to `Decimal @db.Decimal(18,2)`:
  - `Wallet.balance`, `Wallet.heldAmount`
  - `Transaction.amount`
  - `Auction.startingPrice`, `reservePrice`, `currentPrice`, `buyNowPrice`, `dutchPriceStep`, `minIncrement`
  - `Bid.amount`
  - `AutoBid.maxAmount`, `currentBid`
  - `User.rating` left as `Float` (it is a rating, not money).
- `back/prisma/migrations/20260528000000_decimal_money/migration.sql` — hand-written `ALTER TABLE ... ALTER COLUMN ... TYPE NUMERIC(18,2) USING ...::NUMERIC(18,2)` plus `SET DEFAULT 0` / `SET DEFAULT 1` where the schema specifies one. User will run `prisma migrate dev` to apply.

### New helper

- `back/src/lib/decimal.ts` — `D(x)` constructor, `toNum(x)` Decimal→number, `neg(x)` shortcut, and `serializeMoney(value)` that recursively walks objects / arrays and converts every Decimal leaf to a number. Used at the API edge so the frontend's `amount: number` typings stay intact.
- `back/src/__mocks__/money.ts` — asymmetric Jest matcher `m(n)` that matches a value whether it arrives as `number`, `string`, or `Prisma.Decimal`. Lets test assertions like `data: { increment: m(500) }` pass under either the old mocks (plain numbers) or real Prisma (Decimal).

### Services updated to Decimal arithmetic (every `+`, `-`, `<`, `>`, `Math.abs`, `Math.min`, `Math.max` on money replaced with `.add()`, `.sub()`, `.lt()`, `.lte()`, `.gt()`, `.gte()`, `.eq()`, `.neg()`, `.abs()`)

- `back/src/modules/bidding/bid.service.ts::placeBid` — min-bid compare, Dutch exact-match, sealed > startingPrice gate, wallet available-balance compare, hold/release transaction amounts, `currentPrice` write, BID_HOLD `neg()` log amount. Return shape converts `bid.amount` back to number for the controller/socket. `getAuctionBids` serializes both the sealed-masked branch (`toNum`) and the ended-or-non-sealed branch (`map(b => ({ ...b, amount: toNum(b.amount) }))`).
- `back/src/modules/wallet/wallet.service.ts` — `getWallet` / `deposit` / `withdraw` / `getTransactions` all use `D()` for arithmetic and `serializeMoney()` for the return. Withdraw available-balance check is now `D(balance).sub(heldAmount).lt(amountD)`.
- `back/src/modules/auctions/auction.service.ts` — `createAuction`, `getAuctions`, `getAuctionById`, `updateAuction`, `cancelAuction`, `buyNow` all serialize on return. `buyNow` compares `D(buyerWallet.balance).lt(priceD)` and uses `priceD.neg()` for the debit transaction.
- `back/src/modules/payments/payment.service.ts::confirmWinnerPayment` — `existingPayment.amount` uses `D(...).abs()` for the idempotent-already-confirmed return, `winningBid.amount` is pinned to `amountD`, debit side uses `amountD.neg()`, notification + API return convert to number via `toNum`.
- `back/src/modules/auto-bid/auto-bid.service.ts` — `setAutoBid` runs `maxD.gte(currentD)`, `maxD.lt(reservePrice)`, `maxD.lte(currentD)`, balance check via `D(balance).sub(heldAmount).lt(minBid)`. `processAutoBids` computes the ladder via `D(currentPrice).add(minIncrement)`, picks `bidAmountD = beatingAmount.lt(topAutoBid.maxAmount) ? beatingAmount : D(topAutoBid.maxAmount)` (replaces `Math.min`), then converts to `bidAmountNum` once for `placeBid` and notification text.
- `back/src/workers/index.ts` — Dutch `drop-price` uses `D(currentPrice).sub(step)` floored at zero, the reserve guard becomes `D(wb.amount).gte(a.reservePrice)`, and the sealed-loser per-user refund aggregation now sums Decimals (`refunds[uid] = prior.add(loser.amount)`) instead of `+= number` on Float. Final-price socket emits + winner notification convert to `number` via `toNum`. Also removed a stray emoji from the AUCTION_WON title per the no-emoji rule.
- `back/src/modules/users/user.service.ts` — `getBidHistory`, `getMyAuctions`, `getWonAuctions` all serialize.
- `back/src/modules/admin/admin.service.ts` — `getDashboardStats` converts `_sum.amount` via `toNum(...) ?? 0`, `recentAuctions` + `getAllAuctions.auctions` + `moderateAuction` return serialized.
- `back/src/modules/watchlist/watchlist.service.ts::getWatchlist` — serializes nested auction.currentPrice.
- `back/src/modules/auth/auth.service.ts::getMe` — serializes wallet.balance/heldAmount.
- `back/src/gateway/socket.gateway.ts::auction:sync` — converts currentPrice before emitting `auction:state`.

### Tests patched to be Decimal-tolerant

- `back/src/__mocks__/money.ts` — new helper, see above.
- `back/src/modules/bidding/bid.service.test.ts` — outbid release `{ increment: m(100), decrement: m(100) }`, new-bid hold `{ decrement: m(120), increment: m(120) }`, bid.create `data: { amount: m(120) }`.
- `back/src/modules/wallet/wallet.service.test.ts` — deposit `{ increment: m(500), amount: m(500) }`, withdraw `{ decrement: m(500), amount: m(-500) }`.
- `back/src/modules/payments/payment.service.test.ts` — winner debit `{ heldAmount: { decrement: m(500) } }`, seller credit `{ balance: { increment: m(500) } }`, createMany payment rows `{ amount: m(-500) }` / `{ amount: m(500) }`.
- `back/src/modules/auto-bid/auto-bid.service.test.ts` — upsert `maxAmount: m(500)`, currentBid update `data: { currentBid: m(110) }`.
- The Phase A2 global mock defaults in `back/src/__mocks__/prisma.ts` are unchanged — `$queryRaw` and `$transaction` defaults still apply transparently.

### Plan-doc edits

- `plan.md` Phase A1 fully struck through with what landed and the acceptance signal.
- `xdocs/sessions/INDEX.md` — moved the entry from "In Progress" to "Completed" once the commit is recorded.

## Open Questions

- None blocking. Migration is user-run as always.

## Next Up

Per `plan.md` Phase A5–A8 are the queued backend deliverables. Recommended order for the next session:

1. **Phase A3 — Add perf indexes.** Pure migration SQL (B-tree on Auction.status / endTime / type, Bid(auctionId,status), Bid(bidderId), Notification(userId,isRead), Transaction(userId,createdAt); GIN for title+description FTS). Also flip `getAuctions` search from ILIKE to `to_tsvector` once the GIN index exists. No code-level risk, fast win. User runs migrate.
2. **Phase A6 — Auto-bid via BullMQ queue + atomic ladder log.** This is the most user-visible Phase A item (matches the checklist's "every step shows in the log" UX contract). Delete the recursive `processAutoBids -> placeBid -> nested $transaction` flow; replace with a new `auto-bid` queue (per-auction `groupKey`, concurrency 1) whose worker runs the full ladder in one `prisma.$transaction`. The Phase A1 Decimal work makes the ladder math precision-safe.
3. **Phase A7 — Wire `notificationQueue`.** Currently declared but dead. Move `notifyUser` writes off the request path. Quick win.
4. **Phase A8 — Socket.io Redis adapter.** Two-line wire-up: `import { createAdapter } from '@socket.io/redis-adapter'; io.adapter(createAdapter(redisPub, redisSub));` plus the package dep. Makes the dead `redisPub`/`redisSub` exports earn their keep.

## Notes for Future Self

- Decimal arithmetic gotchas:
  - `a + b` on `Prisma.Decimal` returns `NaN` (because `Decimal.valueOf()` returns a number, then JS adds two coerced numbers — but `+` on the Decimal *object* via `.toString()` would concatenate strings). Always use `.add()` / `.sub()` / `.mul()` / `.div()`.
  - `<` / `>` between two Decimals MOSTLY works because Decimal.js defines `valueOf` (returning a number). But this loses precision at the comparison step. Use `.lt()` / `.gt()` / `.eq()` / `.cmp()`.
  - JS unary `-` (`-amount`) coerces Decimal to number via `valueOf()`. Use `.neg()` or the `neg()` helper from `lib/decimal.ts`.
  - `Math.abs`, `Math.min`, `Math.max` all coerce. Use `.abs()`, and write ternaries (`a.lt(b) ? a : b`) for min/max.
- The `serializeMoney()` helper is recursive and walks arrays + nested objects, but it short-circuits Date instances (so date fields pass through untouched). Any new wrapper class that needs special handling (Map, Set, etc.) is not handled — extend the helper if/when needed.
- Prisma's `increment: Decimal` / `decrement: Decimal` on `data` works fine; you can also still pass a plain `number`. So old call-sites that pass a number to `{ increment: bid.amount }` (where `bid.amount` is now Decimal) keep compiling because Prisma's type union accepts both.
- For the seed scripts (`back/src/scripts/*`) I left the `wallet: { create: { balance: 0 } }` style untouched — Prisma write accepts `number | string | Decimal`, so seeding with `100000` still works.
- The frontend was deliberately NOT touched in this session. Because every API edge converts Decimal -> number via `serializeMoney`, the existing `amount: number`, `currentPrice: number` types continue to work. If a future change ever wants strict Decimal end-to-end (e.g., billing reports), revisit the strategy section above and update both ends.
- The `payment.service.confirmWinnerPayment` "already confirmed" branch returns `amount: toNum(D(existingPayment.amount).abs()) ?? 0`. The `?? 0` mirrors the prior `: 0` fallback; in practice `existingPayment.amount` is never null because the column is `NOT NULL`, but the runtime fallback survives unexpected mock returns.
- Asymmetric matcher `m(n)` in `__mocks__/money.ts` is the canonical way to assert on money in tests. If you write a NEW test for a money-touching code path, use `m(n)` instead of bare `n` from the start.

### Acceptance signals for the user to run

- `grep -E "^\s+(balance|heldAmount|amount|startingPrice|reservePrice|currentPrice|buyNowPrice|dutchPriceStep|minIncrement|maxAmount|currentBid)\s+Float" back/prisma/schema.prisma` → 0 hits (was 11 before A1).
- `npm run test:back` — all existing tests should pass with the `m()` matcher patches.
- After `prisma migrate dev`: `\\d wallets` in `psql` should show `balance | numeric(18,2)` and `heldAmount | numeric(18,2)`. Same for the other tables.
- Hit `GET /api/wallet/me` with a valid token — response `balance` and `heldAmount` should be plain JSON numbers (no `{s,e,d}` Decimal objects, no quoted strings).
- Place a bid via `POST /api/bids/:auctionId` — `bid.amount` in the response and the `bid:new` socket payload should be a plain number.

### Commit

- _(this section gets the actual `<hash>` in a follow-up `docs(session): record hash` commit per the convention from the previous session log.)_

---

## Continuation — Phase A3 perf indexes (rolled into the same commit)

User asked for "a little more work and then a final commit". Used the headroom to land Phase A3 (perf indexes) since it's pure migration SQL + `@@index` directives, no arithmetic risk, and rolls cleanly into one commit with A1.

### What landed (in addition to A1 above)

- **`back/prisma/migrations/20260528000001_perf_indexes/migration.sql`** — hand-written `CREATE INDEX` statements:
  - B-tree: `auctions(status)`, `auctions(endTime)`, `auctions(type, status)`, `bids(auctionId, status)`, `bids(bidderId)`, `notifications(userId, isRead)`, `transactions(userId, createdAt DESC)`.
  - GIN: `auctions` over `to_tsvector('english', title || ' ' || description)` — covers the FTS read path that the auction-list search will eventually use.
- **`back/prisma/schema.prisma`** — matching `@@index([...])` directives added on Auction, Bid, Notification, Transaction so subsequent `prisma migrate diff` doesn't churn. The GIN tsvector index can't be expressed in Prisma schema; documented in a comment on the Auction model.

### What was intentionally NOT done

- The `auction.service.getAuctions` search query is still `where: { OR: [{ title: { contains: search, mode: 'insensitive' } }, ...] }` (ILIKE). The GIN index above doesn't help ILIKE — only `to_tsvector(...) @@ plainto_tsquery(...)` will use it. Rewriting `getAuctions` to use `$queryRaw` for the search branch is queued as a one-query follow-up so this commit stays scoped.

### Plan-doc edits

- `plan.md` Phase A3 struck through with what landed and what's deferred.
- This continuation block.

### Acceptance signals (run together with A1's after `prisma migrate dev`)

- `\\di+ auctions*` in psql shows the four new indexes (`auctions_status_idx`, `auctions_endTime_idx`, `auctions_type_status_idx`, `auctions_title_description_fts_idx`).
- `EXPLAIN ANALYZE SELECT * FROM auctions WHERE status = 'ACTIVE' ORDER BY "endTime" DESC LIMIT 20;` shows index-backed access (no `Seq Scan on auctions`).
- After the FTS rewrite (next session), `EXPLAIN ANALYZE` of the search branch shows `Bitmap Index Scan on auctions_title_description_fts_idx`.

## Notes for Future Self

- Decimal arithmetic: `a + b` is meaningless on `Prisma.Decimal` (returns NaN/junk). Always use `.add(b)`, `.sub(b)`, `.mul(b)`, `.div(b)`. Always use `.cmp(b) < 0` / `.lt(b)` / `.lte(b)` / `.gt(b)` / `.gte(b)` instead of `<`/`>`.
- Prisma `{ field: { increment: x } }` accepts both `number` and `Decimal` — no change needed there.
- The `serialize()` helper is shallow-by-default but must handle: top-level object, array-of-objects, nested `bids: [...]` / `transactions: [...]` arrays returned by `include`. Write it recursive but bounded.
- Decimal values stored as `-amount` for WITHDRAWAL/PAYMENT transactions: be careful that `new Decimal(amount).neg()` is used, not `-amount` (which would convert to number first).
