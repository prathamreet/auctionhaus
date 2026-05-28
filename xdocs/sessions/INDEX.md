# Session Index

> Newest on top. One line per session. Click into the file for full notes.

## In Progress

_(none — Phase A1 closed)_

## Completed

- **2026-05-28** — [Phase A1 Decimal Money + A3 Perf Indexes](2026-05-28-phase-a1-decimal-money.md) — **A1:** Every money field switched from Float to `Decimal @db.Decimal(18,2)` in `schema.prisma`. Hand-written migration SQL under `20260528000000_decimal_money/`. New `back/src/lib/decimal.ts` exports `D / toNum / neg / serializeMoney`. All money arithmetic across bid / wallet / auction / payment / auto-bid / workers replaced with Decimal methods. API surface preserved as `number` via `serializeMoney()` at every service-return boundary so the frontend doesn't break. Test helper `__mocks__/money.ts` adds an `m(n)` matcher tolerant of both Decimal and plain number. Stray AUCTION_WON emoji removed. **A3:** B-tree indexes on Auction(status/endTime/type+status), Bid(auctionId+status), Bid(bidderId), Notification(userId+isRead), Transaction(userId+createdAt) + GIN tsvector(title||description) added in `20260528000001_perf_indexes/migration.sql` with matching `@@index([...])` in `schema.prisma`. FTS-search query rewrite in `getAuctions` deferred (index in place, one-query follow-up).
- **2026-05-28** — [Audit & Plan](2026-05-28-audit-and-plan.md) — Deep audit of monorepo, identified doc/code drift, wrote `plan.md` as SSOT, archived AI-generated docs into `xdocs/archive/`, set up this sessions/ folder. Then **Phase A4 fully closed**: sealed-bid privacy fixed across REST (`bid.service`, `auction.service`), socket emit (`bid.controller`), and source (`placeBid` no longer updates `currentPrice` for sealed). Frontend `Bid` type widened. Tests added in both service test files. Then **Phase A2 fully closed**: `FOR UPDATE` pessimistic locks landed in placeBid / withdraw / buyNow / endAuction / confirmWinnerPayment under a global lock-order (auction first, then wallets ASC). Withdraw and buyNow check-then-act races eliminated. endAuction idempotent under BullMQ re-delivery. Global jest mock defaults added so existing tests pass through transparently. Bonus: `setAutoBid` now rejects sealed auctions (was a Phase A6 follow-up identified earlier). Tiny housekeeping fix in `back/README.md`.

## Archive

_(empty — collapse older entries here once INDEX.md grows past ~30 lines)_
