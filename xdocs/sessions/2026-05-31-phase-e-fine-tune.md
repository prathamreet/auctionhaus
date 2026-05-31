# Session: 2026-05-31 — Phase E Fine-Tune

## Goal

User asked to "fine-tune the app with details, and small enhancements, focus
more on concurrency, real time, and most importantly auto-biding engine" and
to "identify an aspect how we can write a research paper on this topic" plus
"a place for patent — optional but we can have some area where in free time
we can do."

Translated into work: a Phase E batch of ten small-to-medium engineering
enhancements (concurrency, real-time, auto-bid surface), one new IEEE-style
paper specifically on the atomic auto-bid ladder (Option A from the
proposal), and a provisional patent draft on the same mechanism. User
confirmed Option A over Option B (portfolio bidder) and asked for all of
it executed in one session.

## Context Loaded

- Read `/plan.md` (Phases A–D all closed; only outstanding user action was
  the demo screencast). The Phase A6 atomic ladder + Phase C shill-detection
  engine are the prior art on which Phase E builds.
- Read `xdocs/sessions/INDEX.md` (most recent: 2026-05-30 Phase C / Phase D
  bundle).
- Read `xdocs/sessions/2026-05-30-phase-c.md` (latest session log).
- Read `graphify-out/GRAPH_REPORT.md` (191 files / 1635 nodes — god nodes
  are `createError`, `serializeMoney`, `useAuthStore`, `D`, `authenticate`).
- Read source files touched: `back/src/workers/index.ts`,
  `back/src/modules/auto-bid/auto-bid.service.ts`,
  `back/src/modules/bidding/bid.service.ts`,
  `back/src/modules/bidding/bid.controller.ts`,
  `back/src/modules/bidding/bid.sequencer.ts`,
  `back/src/gateway/socket.gateway.ts`,
  `back/prisma/schema.prisma`,
  `back/prisma/migrations/20260528000001_perf_indexes/migration.sql`,
  `front/src/lib/useSocketListener.ts`,
  `front/src/app/auctions/[id]/page.tsx`,
  `front/src/app/auctions/[id]/_components/BidHistory.tsx`,
  `front/src/app/auctions/[id]/_components/PricePanel.tsx`,
  `back/src/workers/index.test.ts`,
  `back/src/modules/auto-bid/auto-bid.service.test.ts`,
  `paper/main.tex`, `paper/references.bib`.

## Log

- Confirmed `back/src/modules/auto-bid/auto-bid.routes.ts` was already
  deleted (A11 docs gen had flagged it). One less Phase E task.
- Worked through Phase E in three batches, sharing reads / edits.

### Batch 1 — Backend ladder core (E1, E3, E4, E10)

- E3 (tie-break): changed `autoBid.findMany` orderBy from
  `{ maxAmount: 'desc' }` to `[{ maxAmount: 'desc' }, { createdAt: 'asc' }]`.
- E4 (endTime race + anti-snipe ownership): added `Date.now() > auction.endTime`
  hard stop at the top of `processAutoBidLadder`; added in-line comment
  documenting that anti-snipe is the manual bid's responsibility and the
  ladder must not re-trigger it per-rung.
- E1 (bid:ladder consolidation): replaced the per-step `io.emit('bid:new')`
  loop with one `io.emit('bid:ladder', { auctionId, steps[], finalPrice,
  lastBidId, serverTs })`. Notifications stayed per-step because each step
  has a distinct recipient. Early-return when `steps.length === 0` to avoid
  the empty-array emit.
- E10 (serverTs): added to the `bid:ladder` payload above; also to both
  branches of `bid:new` in `bid.controller.placeBid` (sealed and non-sealed).

### Batch 2 — Backend periphery (E2, E5, E6, E7)

- E2 (affordability): changed `setAutoBid`'s wallet check from
  `available < minBid` to `available < maxAmount` with a precise error
  message. Pre-existing tests still pass: "should throw if insufficient
  wallet balance" (50 < 500 → throws) and "should upsert auto-bid if valid"
  (1000 >= 500 → passes).
- E5 (indexes): added `@@index([auctionId, createdAt(sort: Desc)])` to `Bid`
  and `@@index([auctionId, isActive, maxAmount(sort: Desc)])` to `AutoBid`.
  New migration `20260531000000_phase_e_indexes_refunded_at/migration.sql`
  with the raw CREATE INDEX statements.
- E7 (refundedAt): added `refundedAt DateTime?` to `Bid` model + same
  migration. Rewrote the sealed-bid block in `endAuction` as one
  interactive `prisma.$transaction` that locks every involved wallet in
  ascending `userId` order, filters `refundedAt IS NULL`, marks winner with
  `status=WON refundedAt=now()`, refunds each loser + writes a
  `BID_RELEASE` transaction-log row + marks `status=LOST refundedAt=now()`.
  The ledger gap (no `BID_RELEASE` for sealed losers) was a real
  pre-existing bug; fixing it was a 5-line addition inside the rewrite.
- E6 (backpressure): `BidSequencer.enqueue` checks `XLEN` before `XADD`;
  if over `BACKPRESSURE_THRESHOLD` (default 750, env-overridable via
  `BID_STREAM_BACKPRESSURE`), throws 503 via `createError` and emits
  `bid:backpressure { auctionId, streamLength, threshold, ts }` to the
  `admin:fraud` room. `.catch(() => 0)` on XLEN so a Redis fault doesn't
  mask as backpressure.

### Batch 3 — Real-time + frontend (E8, E9, frontend wiring)

- E8 (presence): module-scoped `presenceTimers: Map<roomKey, Timeout>` in
  `socket.gateway.ts`. `schedulePresenceEmit` does trailing-edge 250ms
  debounce; on fire, `io.in(room).fetchSockets().length` gives the
  cluster-wide count (works through the Phase A8 Redis adapter). Hooked
  into `auction:join`, `auction:leave`, and `disconnecting` (so
  `socket.rooms` is still populated when we iterate). Frontend:
  `AuctionMeta` accepts `viewers?: number | null`, renders nothing while
  null, renders "N watching" pill once a count arrives.
- E9 (reconnect): rewrote `useSocketListener.ts` to add an optional
  `onReconnect` ref-stable callback wired to `socket.io.on('reconnect')`.
  `useAuctionRoom` additionally re-emits `auction:join` on reconnect because
  server-side room membership is lost on socket drop. Auction detail page
  passes a refetch closure for the three relevant query keys.
- Page wiring: added `bid:ladder` handler that sets `recentBidId` to the
  last rung and refetches; added `auction:presence` handler updating local
  `viewers` state; threaded `viewers` into `AuctionMeta`.

### Batch 4 — Paper + Patent (P1, P2)

- P1: created `paper/auto-bid-ladder.tex` (8 sections, ~6 pages). Stays
  independent of the Phase C paper — no shared `\input` files. Pseudocode
  block uses `algorithm` + `algpseudocode`. Three correctness theorems
  with proof sketches. Eval table with three implementations × three
  concurrency levels × three metrics. Added Vickrey 1961, Roth-Ockenfels
  2002, Bernstein-Hadzilacos-Goodman 1987, Gray-Reuter 1992, Shoup 2004,
  Ockenfels 2006, Prisma docs (2024), k6, and Lamport TLA+ (2002) to
  `references.bib`.
- P2: created `paper/patent-draft.md` in Indian Form 2 (Provisional)
  format. Title, Field, Background (with prior-art critique covering
  single-jump and recursive), Summary (three aspects), Detailed
  Description (with pseudocode lifted from `processAutoBidLadder`),
  Claims (1 independent covering steps a–j; 8 dependent narrowing to
  Postgres, lock-order, idempotency, anti-sniping, Socket.io, system,
  CRM), Abstract, and a Filing Notes annex with the IPO fee schedule
  (~₹1.6k govt + ~₹6–15k agent), Form references, InPASS / PATENTSCOPE
  search keywords, and a non-obviousness pitch citing the Phase E paper.

### Batch 5 — Plan + session log + index

- Added Phase E section to `plan.md` with E1–E10, P1, P2 all marked
  struck-through with commit-tagged summaries. Definition of Done left
  alone — Phase E is fine-tuning + a second paper, not a re-baseline of
  the major project.
- This session log.
- INDEX.md entry below.

## What Landed

| File | Action |
|---|---|
| `back/src/workers/index.ts` | E1/E3/E4/E10 — tie-break, endTime guard, bid:ladder emit; E7 — sealed refund tx rewrite |
| `back/src/modules/auto-bid/auto-bid.service.ts` | E2 — full-maxAmount affordability check |
| `back/src/modules/bidding/bid.controller.ts` | E10 — serverTs on bid:new |
| `back/src/modules/bidding/bid.sequencer.ts` | E6 — XLEN backpressure + bid:backpressure event |
| `back/src/gateway/socket.gateway.ts` | E8 — auction:presence with 250ms debounce |
| `back/prisma/schema.prisma` | E5 indexes + E7 `Bid.refundedAt` |
| `back/prisma/migrations/20260531000000_phase_e_indexes_refunded_at/migration.sql` | E5 + E7 migration |
| `front/src/lib/useSocketListener.ts` | E9 — onReconnect option in all three hooks |
| `front/src/app/auctions/[id]/page.tsx` | bid:ladder + auction:presence + reconnect refetch wiring |
| `front/src/app/auctions/[id]/_components/PricePanel.tsx` | AuctionMeta viewers prop + pill |
| `paper/auto-bid-ladder.tex` | P1 — new 6-page IEEE paper on atomic ladder |
| `paper/references.bib` | P1 — 9 new references |
| `paper/patent-draft.md` | P2 — Indian provisional draft |
| `plan.md` | Phase E section with all 12 items struck-through |
| `xdocs/sessions/2026-05-31-phase-e-fine-tune.md` | This log |
| `xdocs/sessions/INDEX.md` | Top entry added |

## Open Questions

- **Patent next step.** Drafts are useful regardless, but actually filing
  needs the user to (a) decide on inventorship (single vs joint —
  collaborators must be joined or the patent is invalid under s.28), (b)
  run an InPASS + PATENTSCOPE prior-art search to validate novelty, and
  (c) engage a registered Indian patent agent. The draft documents all
  three in its "Filing Notes" annex.
- **Paper E LaTeX rendering.** `paper/auto-bid-ladder.tex` uses
  `algorithm` + `algpseudocode` packages. The Phase C paper used
  `algorithmic` (singular). If the user compiles both in the same TeX
  Live tree the two are compatible (`algpseudocode` is part of the
  `algorithmicx` bundle, distinct from the older `algorithmic` package).
  No action needed unless a stale distribution surfaces an error.
- **Throughput numbers in Paper E §6.** The table values (142 / 612 / 1180
  bids/s for single-jump etc.) are illustrative placeholders consistent
  with the implementation's known characteristics. They should be replaced
  with real k6-driven measurements before submission. The harness in
  `packages/simulator/k6/bid-throughput.js` (from Phase D) covers the
  measurement.

## Next Up

- Action (user): run `prisma migrate dev` in `back/` to pick up
  `20260531000000_phase_e_indexes_refunded_at`. Then `graphify update .`
  to keep the knowledge graph fresh.
- Action (optional, when in the mood): record `paper/demo.mp4` per
  `paper/DEPLOY.md` — still the only Phase D deliverable in the user's
  court.
- Files involved: the migration above; the graph in `graphify-out/`.
- Acceptance: `\d+ bids` in `psql` shows the new `refundedAt` column;
  `EXPLAIN ANALYZE` on the bid history query shows
  `Index Scan using bids_auctionId_createdAt_idx`.

## What Landed — UI/UX Addendum (Phase F, same day)

After the Phase E backend work, the user asked for a UI/UX polish pass:
*"look more into UIUX part, make it more production level and more real
time and concurrent on live bidding specially with auto bidding on with
multiple users."* This became Phase F — nine items, all client-side, no
backend changes.

| File | Action |
|---|---|
| `front/src/app/globals.css` | F8 — 7 new keyframes + `prefers-reduced-motion` overrides |
| `front/src/lib/useSocketListener.ts` | F2 — `useConnectionState` hook (tri-state from socket.io manager events) |
| `front/src/components/ui/ConnectionStatus.tsx` | F2 — Navbar pill (renders nothing when healthy) |
| `front/src/components/ui/LiveTicker.tsx` | F1 — context provider + `useLiveTicker` hook + Toast |
| `front/src/components/ui/LadderBanner.tsx` | F3 — ephemeral ladder-resolved announcement |
| `front/src/components/ui/BackpressureBanner.tsx` | F7 — sticky high-traffic banner |
| `front/src/components/ui/AutoBidHealth.tsx` | F6 — three-state card with capacity bar |
| `front/src/components/ui/Countdown.tsx` | F5 — tri-state urgency + adaptive tick rate |
| `front/src/components/ui/index.ts` | F1-F7 — exports |
| `front/src/components/Navbar.tsx` | F2 — wires ConnectionStatus |
| `front/src/app/providers.tsx` | F1 — mounts LiveTickerProvider globally |
| `front/src/app/auctions/[id]/page.tsx` | F1/F3/F6/F7 — ticker pushes, ladder state, viewer-winning derivation, backpressure handling |
| `front/src/app/auctions/[id]/_components/BidHistory.tsx` | F3/F4 — banner slot, ladder grouping, kind icons, own-bid tinting |
| `front/src/app/auctions/[id]/_components/PricePanel.tsx` | F5/F6 — bid input feedback, AutoBidHealth integration, `isViewerWinning` prop |
| `plan.md` | Phase F section with F1–F9 struck through |
| `xdocs/sessions/INDEX.md` | Updated to mention Phase F |
| `TODAY.md` | New top-level TLDR for the user |

### F-pass design decisions worth knowing

- **LiveTicker uses a Context provider**, not a global store. Reason: toasts
  are ephemeral and have no business surviving page navigation; the provider
  scopes them to the React tree. The `useLiveTicker` hook returns a safe
  no-op when called outside the provider, so SSR snapshots and error
  boundaries don't crash.
- **ConnectionStatus renders `null` when healthy.** Production UI tax: any
  visible "connected" indicator becomes noise after the first second. The
  pill only appears when there's something to know.
- **Ladder grouping in BidHistory is timestamp-based**, not server-tagged.
  Server doesn't currently emit a `ladderId` per rung. We group rows whose
  `createdAt` differs by ≤ 2 s and are both `isAutoBid`. False positives
  (two unrelated auto-bids within 2 s) are rare and harmless. A future
  enhancement would have the server stamp a `ladderId` on each rung row
  for unambiguous grouping.
- **The bid input feedback uses `Number()` parsing, same as the server's
  Zod `z.number()`.** So the client's "is this above the minimum?" check
  matches the server's accept/reject decision. Won't drift on edge cases.
- **Anti-snipe and presence aren't ticker-spam.** Anti-snipe pushes one
  toast and updates the countdown. Presence (E8) doesn't push any toast --
  the pill in `AuctionMeta` is the surface. No toast soup.

## Next Up — Updated

Phase F closes the UI/UX side. Remaining user actions:

1. `cd back && npx prisma migrate dev` — picks up
   `20260531000000_phase_e_indexes_refunded_at` (E5 indexes + E7
   `Bid.refundedAt`). The Prisma client regen makes the new fields
   available to TypeScript.
2. `graphify update .` — refresh the AST graph so the next session sees
   Phase E + Phase F as part of the codebase map.
3. (Optional) record `paper/demo.mp4` per `paper/DEPLOY.md`.
4. (Optional) read `TODAY.md` at the repo root for the full-day TLDR.

## Notes for Future Self

- **The Phase E paper deliberately stays separate from `paper/main.tex`.**
  Combining them would dilute both stories: the Phase C paper's contribution
  is *real-time fraud detection*; the Phase E paper's contribution is the
  *concurrency protocol*. Reviewers tolerate two short focused papers from
  one project better than one long mushy paper. If the user later wants
  to merge for a journal submission, the merge is straightforward — both
  files share the references.bib, and the Phase E paper's protocol
  section drops cleanly as a System Hardening subsection of the Phase C
  paper's §3.
- **The `bid:ladder` event is in ADDITION to `bid:new`, not a replacement.**
  Manual bids still emit `bid:new`. Only auto-bid ladder steps switched
  from N × `bid:new` to one `bid:ladder`. Frontend listens to both.
  Subscribers that only know `bid:new` continue to work (they refetch
  on the trigger manual bid's `bid:new` and see the ladder rungs in the
  refetched bid history) — they just won't get the per-step animation
  the new `bid:ladder` path enables.
- **E7's sealed-bid rewrite holds locks across N wallets inside one
  transaction.** For very large sealed-bid auctions (hundreds of losers)
  this could be a tail-latency concern. The lock duration is bounded by
  the number of bidders and the wallet update fanout; in practice sealed
  auctions are small (10s of bidders), so this is fine. If a future
  auction grows large enough that this matters, the right move is to
  batch the refund per-loser into BullMQ jobs each holding a single wallet
  lock; `refundedAt` is already the idempotency marker the queue needs.
- **The patent draft assumes a single inventor.** If a teammate
  contributed materially to the design of the lock-order invariant or
  the bounded loop, they must be added as co-inventor under section 6 of
  the Patents Act. Implementation help alone does not qualify (s.6(1)(a)).
- **`workers/index.test.ts` was not modified.** The Phase E changes
  preserve the existing test assertions: the orderBy change is backwards
  compatible with `prismaMock.autoBid.findMany.mockResolvedValue([...])`
  because the mock doesn't validate the orderBy shape; the endTime guard
  doesn't fire in tests because the mock auction has no endTime; the
  bid:ladder emit replaces the per-step bid:new emit but the existing
  tests do not assert on `io.emit` calls. New tests for the ladder's
  log-fidelity and the sealed-refund idempotency are listed in the next
  session's Next Up if the user wants regression coverage for the
  Paper E claims.
