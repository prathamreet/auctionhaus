# Session: 2026-05-29 — FTS Search Rewrite

## Goal

User said "start where u left and complete". Per the previous session's "What's deliberately NOT in this commit" list, the deferred backlog was: (1) cross-instance suspend invalidation via Redis pub/sub, (2) the FTS search rewrite in `getAuctions`, (3) the A5 EscrowService consolidation. This session closes the **FTS search rewrite** (the last low-risk, money-flow-free Phase A item) and triages the rest for the user.

## Context Loaded

- `/plan.md` — Phase A status (A1/A2/A3/A4/A6/A6.x/A7/A8/A9 all struck through; A5/A10/A11 + two leftovers open).
- `xdocs/sessions/INDEX.md` + the most recent log `2026-05-28-phase-a1-decimal-money.md` (Continuation 3 listed the deferred items).
- `graphify-out/GRAPH_REPORT.md` (graph built from `dc64efa8` — stale by the A7/A8/A9 commit `3d4a98d`; refreshed at end of session).
- Source verified (trust code, not docs): `back/src/modules/auctions/auction.service.ts` (getAuctions still ILIKE), `back/prisma/migrations/20260528000001_perf_indexes/migration.sql` (GIN index expression), `back/prisma/schema.prisma` (title/description both non-null), `back/src/workers/index.ts`, `back/src/modules/payments/payment.service.ts`, `back/src/middleware/auth.middleware.ts`, `back/src/lib/redis.ts` (for the deferred items' feasibility).
- `back/src/__mocks__/prisma.ts` + `back/src/__tests__/setup.ts` (mock harness: `$queryRaw` default returns `[{id:'_locked_'}]`; `lib/prisma` globally mocked).

## Log

- Confirmed git HEAD is `3d4a98d` and Phase A1–A9 + A6.x are all committed and present in code (not just in docs).
- Confirmed A10 is effectively already satisfied: `bible.md`, `done.md`, `back-learn.md`, `frontend_suggestion.md`, `jules-suggestion/` are all under `xdocs/archive/` (moved, not deleted — done.md was archived rather than deleted, consistent with Rule 9 protecting `xdocs/not-for-ai/`).
- Triaged the three deferred items:
  - **FTS rewrite** — safe, testable, money-flow-free, uses the already-built GIN index. **Done this session.**
  - **Cross-instance suspend invalidation** — deferred. Sharing the socket-adapter's `redisSub` connection for a second `subscribe('user:invalidate')` is fragile/version-dependent, and a dedicated 5th Redis connection cuts against the user's "Redis is heavy" concern. The 30s-TTL bound is acceptable for a college project (already documented in the auth-middleware comment).
  - **A5 EscrowService** — deferred. It is a money-flow refactor + new `Settlement` model + migration that I cannot validate without running the app (user's hard rule: no dev/migrate runs). It also changes `confirmWinnerPayment`'s idempotency mechanism. Deserves the user's input on the `Settlement` model design before touching money flow blind.

## What Landed

- **`back/src/modules/auctions/auction.service.ts` — `getAuctions`** rewritten from ILIKE `contains` to Postgres FTS:
  - Search term tokenised to `[a-z0-9]` words; each gets the `:*` prefix operator (so "rol" matches "rolex"); ANDed into a `to_tsquery('english', ...)`.
  - The tsquery string is built only from `[a-z0-9]` tokens we control and is passed as a **bound parameter** (`${tsquery}`), never string-concatenated — no injection surface, and tokens can't smuggle tsquery operators.
  - Only the FTS match runs in raw SQL: `SELECT id FROM auctions WHERE to_tsvector('english', title || ' ' || description) @@ to_tsquery('english', ${tsquery})`. The WHERE expression is byte-for-byte the GIN index expression from `20260528000001_perf_indexes`, so the planner uses the index.
  - Matched ids feed back into the **existing** Prisma `findMany`/`count` via `where.id = { in: [...] }`, so status/type filters, pagination, `include` (seller, `_count`), `orderBy: createdAt desc`, and Decimal→number `serializeMoney` all stay type-safe and unchanged.
  - All-punctuation / empty-token queries short-circuit to `{ auctions: [], total: 0, page, limit, totalPages: 0 }` without touching the DB (`to_tsquery('')` would otherwise be a no-op match).
- **`back/src/modules/auctions/auction.service.test.ts`** — added `getAuctions` describe block with 3 tests: (a) search present → `$queryRaw` runs + matched ids land in `findMany`'s `where.id.in`; (b) all-punctuation search → empty page, no DB calls; (c) no search term → no `$queryRaw` call. Added `getAuctions` to the import line.
- **`plan.md`** — Phase A3's "Deferred FTS rewrite" note struck through with what landed + the `EXPLAIN ANALYZE` acceptance signal.
- **Did NOT touch** `20260528000001_perf_indexes/migration.sql` — even the comment, because the file is checksummed by Prisma's `_prisma_migrations` once applied; editing it would trigger a drift warning on the user's next `migrate` run.
- Ran `graphify update .` to refresh the AST graph.
- No commit made (user owns git).

## Open Questions

- **A5 EscrowService design (blocking A5 only).** The plan says "idempotent via a `Settlement` row uniqued on `auctionId`". The real duplication is `buyNow`'s buyer→seller transfer vs `confirmWinnerPayment`'s winner→seller transfer (note: `endAuction` does NOT pay the seller — it only determines the winner + refunds sealed losers; payment is deferred to the winner-confirms step). Before building A5: does the user want the new `Settlement` row to *replace* `confirmWinnerPayment`'s existing "existing PAYMENT transaction" idempotency check, or sit alongside it as a second guard? And confirm the `Settlement` model fields (auctionId @unique, sellerId, buyerOrWinnerId, amount, kind: DIRECT_SALE | WON_AUCTION, createdAt).

## Next Up

- **Action:** Phase A5 — build `back/src/modules/escrow/escrow.service.ts` exposing one `settle()` path used by both `buyNow` and `confirmWinnerPayment`, idempotent via a new `Settlement` model uniqued on `auctionId`. Get the user's answer to the Open Question above first (it's a money-flow + schema change they can't validate by running, so confirm the model shape before writing).
- **File(s) involved:** new `back/prisma/migrations/2026XXXXXXXXXX_settlement/migration.sql` + `Settlement` model in `schema.prisma`; new `escrow.service.ts`; refactor `auction.service.buyNow` + `payment.service.confirmWinnerPayment` to call it; tests.
- **Acceptance signal:** two concurrent `confirmWinnerPayment` (or a `buyNow` racing a `confirmWinnerPayment`) on the same auction settle exactly once — `SELECT count(*) FROM settlements WHERE "auctionId" = ?` returns 1, and the seller's balance moved by the winning amount exactly once.

## Notes for Future Self

- **FTS semantics vs ILIKE:** the new search matches on **lexeme prefixes**, not arbitrary substrings. "rol" → "rolex" works (prefix). But mid-word substrings ("lex" → "rolex") will NOT match, unlike the old ILIKE `%lex%`. This is the intended FTS trade-off and what the GIN index supports. If the user reports "search feels different", this is why — not a bug.
- The FTS branch issues an extra round-trip (one `$queryRaw` for ids, then `findMany` + `count`). For a ~100-row catalogue the `IN (...)` list is tiny. If the catalogue ever grows large, fold the FTS predicate + pagination into a single raw query (with enum casts `::"AuctionStatus"`) and hydrate — but that loses Prisma's type-safety on the filters, which is why this session kept the two-step form.
- Results are still ordered by `createdAt desc`, NOT by `ts_rank` relevance. If the user wants relevance ranking, return `ts_rank(...)` from the raw query and order the hydrated rows by the id order — but that conflicts with the current createdAt ordering, so it's a deliberate UX decision for the user, not an automatic change.
- The test relies on the global `$queryRaw` default (`[{id:'_locked_'}]`) from `__mocks__/prisma.ts`; the search test overrides it with `mockResolvedValueOnce([{id:'a1'},{id:'a2'}])`. If a future test asserts on the *exact* SQL, note that `$queryRaw` is a jest mock that ignores the template literal — it can't assert SQL text, only that it was called.

### Acceptance signals for the user to run

- `npm run test:back` — the 3 new `getAuctions` tests pass; nothing else regresses.
- After the app is up: `GET /api/auctions?search=rol` returns auctions whose title/description contain a word starting with "rol". `EXPLAIN ANALYZE` of that query's id-match shows `Bitmap Index Scan on auctions_title_description_fts_idx` (not `Seq Scan on auctions`).
- `GET /api/auctions?search=%21%21%21` (i.e. "!!!") returns an empty page with no DB error.

### Commit

- _(hash recorded after `git commit` runs, per convention — only when the user asks.)_
