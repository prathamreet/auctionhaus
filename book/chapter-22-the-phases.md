# Chapter 17 — The Development Story: Phase by Phase

## How This Chapter Is Organised

This is the chronological story of how AuctionHaus was built and improved, phase by phase. Each phase had a goal, a set of specific tasks, and lessons learned. Reading this chapter gives you the complete picture of how a college project becomes research-worthy.

---

## Phase A: Truth and Hardening (May 2026)

**Goal:** Make the code match the documentation. Fix every financial and concurrency bug before building anything new.

### A1 — Decimal Money

**Date:** 2026-05-28

**What was wrong:** Every money field was `Float` in Prisma schema → Postgres `FLOAT8`. JavaScript `number` type → IEEE-754 rounding errors.

**What was done:**
- Wrote migration: `ALTER COLUMN balance TYPE NUMERIC(18,2) USING balance::NUMERIC(18,2)`
- Changed schema to `Decimal @db.Decimal(18,2)` for all money fields
- Created `back/src/lib/decimal.ts` with `D()`, `toNum()`, `serializeMoney()`
- Updated all services to use Decimal arithmetic
- API boundary: `serializeMoney()` converts to plain numbers for JSON

**Lesson:** Fixing money precision was the most important thing we did. A financial system that rounds incorrectly is not just inaccurate — it is untrustworthy.

### A2 — Row Locks

**What was done:**
- Added `SELECT * FROM auctions WHERE id = ? FOR UPDATE` in `placeBid`
- Added `SELECT * FROM wallets WHERE userId = ? FOR UPDATE` in `withdraw`
- Established the global lock order: auction first, wallets ascending by userId
- Wrapped `endAuction` in a locked transaction for idempotency

### A3 — Indexes

**What was done:**
- 7 B-tree indexes: `Auction(status)`, `Auction(endTime)`, `Auction(type,status)`, `Bid(auctionId,status)`, `Bid(bidderId)`, `Notification(userId,isRead)`, `Transaction(userId,createdAt)`
- GIN tsvector index for full-text search
- FTS search implemented in `getAuctions` using `to_tsquery` with `:*` prefix operators

### A4 — Sealed-Bid Privacy Fix

**What was wrong:** `{ select: { name: false } }` in Prisma — Prisma ignores `false` fields, returns everything.

**What was done:** Return `amount: null, bidder: null` for non-own bids in ACTIVE sealed auctions. OrderBy `createdAt ASC` (not amount desc) to prevent sorting-based inference.

### A5 — EscrowService

**What was done:** Created `modules/escrow/escrow.service.ts` with `settleWithinTx`. Added `Settlement` model for idempotency. Refactored `buyNow` and `confirmWinnerPayment` to use it.

**Lesson:** Centralise money movement. Duplicate payout logic is duplicate bugs.

### A6 — Auto-Bid via Queue

**What was done:** Deleted `processAutoBids` (nested transactions, fire-and-forget). Replaced with `autoBidQueue.add` after `placeBid` commits. Implemented `processAutoBidLadder` in workers with one transaction, per-increment logging.

**Lesson:** The UX contract matters. The fraud detector needs per-step bid rows. A single-jump implementation would have broken the research contribution.

### A7 — Wire Notification Queue

**What was done:** `notifyUser` now enqueues instead of writing inline. Notification DB write + socket emit happen in the worker.

### A8 — Socket.io Redis Adapter

**What was done:** `io.adapter(createAdapter(redisPub, redisSub))`. The previously-dead `redisPub`/`redisSub` connections became real.

### A9/A9.x — Auth Cache + Cross-Instance Invalidation

**What was done:** In-memory user cache with 30s TTL. `redisInvalidateSub` dedicated subscriber. `admin.suspendUser` publishes to `user:invalidate` channel.

### A10/A11 — Documentation Truth

**What was done:** Moved `bible.md`, `done.md`, `back-learn.md` to `xdocs/archive/`. Created `generate-docs.ts` for code-derived documentation.

**Lesson:** Never trust documentation that was written aspiration-first. Trust the code.

---

## Phase B: Design System (May 30, 2026)

**Goal:** Make the UI so impressive that a teacher opens the browser and says "oh."

### What Was Done

- Extracted 13 UI primitives: Button, Input, Select, Field, Card, Badge, Skeleton, EmptyState, Stat, Alert, PageHeader, Money, Countdown, BidChart, Tabs, ThemeToggle
- Split the 1,419-line auction detail page into 4 sub-components + 250-line orchestrator
- Added dark mode via CSS custom properties with `ThemeBootstrap` no-flash script
- Added skeleton loaders (replaced every "Loading..." string)
- Added `useSocketListener` ref-stable hook (replaced broken pattern in every page)
- Added `lib/contracts.ts` mirroring backend Zod schemas + `useZodForm` hook
- Admin `/admin/fraud` scaffold page for Phase C

**Lesson:** A well-designed component library is not optional — it is the difference between a project that looks like a student project and one that looks like a product.

---

## Phase C: The Research Build (May 30, 2026)

**Goal:** Build the actual research contributions.

### C1 — Simulator

Four agent classes: TruthfulAgent, SniperAgent, ShillAgent, CollusionAgent. `run.ts` creates auctions via the API, drives agents, writes `events.jsonl` with ground-truth labels.

### C2/C3 — Fraud Engine

`BidGraph` with 30-minute sliding window and lazy pruning. `extractFeatures` (5 features). In-process logistic regression classifier. `FraudEngine` singleton wired into `bid.service.placeBid` as fire-and-forget.

### C4 — Admin Fraud Dashboard

`/admin/fraud` fully wired: live `fraud:flag` socket feed, FeatureBar visualisation, ScoreBadge, dismiss/suspend actions, top-bidders leaderboard.

### C5 — Eval Harness

`eval.ts`: offline replay of `events.jsonl`, precision/recall/F1 at all thresholds, ROC curve, per-feature ablation, two baselines. Output: LaTeX table + JSON data files.

### C6 — Cryptographic Commitments

`BidCommitment` model + `commitment.service.ts` + 3 endpoints. SHA-256 commit-reveal. `CommitmentPanel.tsx` frontend.

### C7 — Redis Stream Sequencer

`BidSequencer` class with `enqueue` + `startConsumer`. `docs/architecture/sequencer.md` with benchmark table. Activated via `BID_SEQUENCER=true`.

### C8 — Paper Draft

`paper/main.tex` — 8-section IEEE paper. `paper/references.bib` — 7 cites. `paper/poster.tex` A1 poster. `paper/tables/metrics.tex` placeholder so the paper compiles immediately.

---

## Phase D: Deploy and Viva Prep (May 30, 2026)

- `paper/viva-prep.md` — three viva questions scripted to <60 seconds
- `paper/DEPLOY.md` — Docker Compose + Railway/Vercel options + 3-min demo script
- `docker-compose.yml` at repo root with Postgres 15 + Redis 7

---

## Phase E: Fine-Tuning the Engine (May 31, 2026)

Ten engineering improvements + two papers + one patent.

**E1** — Batched `bid:ladder` event (one event for N rungs)  
**E2** — Pre-flight affordability check in `setAutoBid`  
**E3** — Stable tie-break: `ORDER BY maxAmount DESC, createdAt ASC`  
**E4** — `endTime` race guard in the ladder  
**E5** — Two hot-spot indexes  
**E6** — Redis Stream backpressure: `XLEN` check + `bid:backpressure` event  
**E7** — `Bid.refundedAt` idempotent sealed-loser refunds  
**E8** — `auction:presence` with 250ms debounce  
**E9** — `onReconnect` callbacks in socket hooks  
**E10** — `serverTs` on all bid events  

**P1** — `paper/auto-bid-ladder.tex` — atomic ladder IEEE paper  
**P2** — `paper/patent-draft.md` — Indian Form 2 provisional specification

---

## Phase F: Live Bidding UI (May 31, 2026)

**Goal:** Make the real-time bidding experience feel like a real product, not a student demo.

F1 LiveTicker, F2 ConnectionStatus, F3 LadderBanner, F4 BidHistory polish (ladder grouping + icons), F5 Countdown urgency + BidInputFeedback, F6 AutoBidHealth card, F7 BackpressureBanner, F8 CSS animations + prefers-reduced-motion, F9 Plan + session docs + TODAY.md.

---

## Phase RP: Paper Reconciliation (June 2, 2026)

**Context:** The paper was submitted to an IEEE venue on June 1. Post-submission, a `train:fraud` run overwrote `fraud.classifier.ts` with new weights and a new threshold. The code no longer matched the paper's supplementary material.

**Actions:**
- Restored paper-snapshot constants (threshold 0.20, weights from supplementary Tables III + VII) with `PAPER_SNAPSHOT: 2026-06-01` banner
- Added safety guard to `train.ts`: default run writes only to `fraud.classifier.candidate.ts`; live-snapshot overwrite requires `--write --confirm`
- Preserved three paper-era sim runs under `runs/_paper-snapshot/`
- Created `train.v2.ts` (corrected real-sellerId trainer, non-destructive)
- Added `paper/figures/k6_results.json` matching supplementary Table XII
- Created `run-canonical.ps1` — reproducible six-run k6 sweep
- Implemented `LatencyRing` + `BidGraph.stats()` + `GET /api/fraud/perf`

**Lesson:** Treat a submitted paper as frozen code. Any post-submission change to model weights is a reproducibility violation. Lock the snapshot; experiment in a separate file.

---

## Phase RP-2: Honest Pipeline Rebuild (June 3, 2026)

**Context:** The paper was rejected on domain scope (not technical merit) — the venue was outside our subject area. With the freeze lifted, implement the deferred corrections.

**The problem:** The single-auction simulator created no variance in σ (seller co-occurrence). Every bidder had σ=1 by definition. The classifier learned to distinguish shill bids based on other features in the training data, but the paper claimed σ was the dominant feature. The numbers were suspicious.

**Actions:**
- Rewrote `run.ts`: 3 primary auctions (same seller) + 1 decoy (different seller). Shill/collusion agents span all 3 primary auctions (high σ). Truthful/sniper agents take 1 each (low σ).
- Created `dataset.ts`: shared replay path with FNV-1a deterministic train/test split
- Rewrote `train.ts`: fits on train partition only, no leakage, writes classifier directly
- Rewrote `eval.ts`: reports on held-out test, two real baselines, ROC on test data
- Removed `train.v2.ts` (the fiction of two trainers was confusing; one correct trainer is better)
- Closed the audit finding: `endAuction` now settles the seller automatically (no more "winner confirms" requirement)

**Honest test-set results (vs paper-era training-set results):**
- Paper: F1 = 1.000 (training corpus, threshold 0.20)
- Honest: F1 = 0.933 (held-out test, threshold 0.5)

Both strong. The honest number is more credible.

**Lesson:** A real evaluation uses held-out data. If your test set is your training set, your results are optimistic. The FNV-1a deterministic split was the right engineering choice.

---

## Phase G: Pre-Review Fine-Tuning (June 2, 2026)

**Context:** A project review was scheduled for June 4. Phase G polished the rough edges a reviewer would notice first.

G1 ErrorBoundary, G2 landing page footer fix (removed fake metrics), G3 wallet polish, G4 dashboard zero-state, G5 backend log emoji cleanup, G6 seed-users adds `hoster@x.com`, G7 toolchain/build fixes, G8 `seed-demo.ts` one-shot idempotent demo seeder.

---

## The Overarching Lesson

Looking at all the phases together, the pattern is clear:

1. Start with honesty: understand what the code actually does, not what the docs claim
2. Fix the foundations before building features (Phase A before B, B before C)
3. Research contributions need real measurements: synthetic data is acceptable, but the evaluation must be honest (held-out test, not training-set self-evaluation)
4. Lock snapshots when you publish: post-submission changes to model weights invalidate your paper's reproducibility claims
5. The phase structure itself — having a named, articulated plan before touching code — saved countless hours of unfocused work

---

## Next Chapter

Chapter 18 explains the academic literature context — every paper we cited, why it mattered, and how our work relates to and extends the field.
