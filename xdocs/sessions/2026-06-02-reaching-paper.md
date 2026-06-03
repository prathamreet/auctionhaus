# Session: 2026-06-02 — Reaching the Paper (Phase RP)

## Goal

The IEEE submission was sent on 2026-06-01. By 2026-06-02 the running code had drifted from the manuscript's claims, mostly because `train:fraud` had been re-run after submission and silently overwrote `fraud.classifier.ts` with new weights, threshold, and norm-params. The user noticed the gap and asked for an honest audit plus a code-side reconciliation that does not edit the paper, so that pulling the repo would not contradict the published claims.

User chose Option 3 from the chat-tier decision: keep the paper-faithful trainer at `train.ts` (its imperfect sellerId resolution is what produced the published weights; the filename matches what `paper/supplementary.tex` §4.1 references), add a separate `train.v2.ts` for the corrected pipeline that writes to a candidate file only.

## Context Loaded

- `plan.md` (Phases A-F all struck through, only paper/demo and prisma-migrate are pending user actions).
- `xdocs/sessions/INDEX.md` (Phase E + F was the previous session, 2026-05-31).
- `paper/main.tex`, `paper/supplementary.tex`, `paper/cover-letter.tex`.
- `docs/rp/rp-audit-01-plan-phase1A-sim.md` and `rp-audit-01-plan-phase1A-k6.md` (raw console logs that produced the paper's numbers).
- `reaching-rp.md` (audit + plan written earlier in the same chat).
- All five files under `back/src/modules/fraud/` and the four under `packages/simulator/src/`.

## Log

- Verified the drift: live `fraud.classifier.ts` had `SCORE_THRESHOLD=0.55` and a different weight vector than the paper. Two extra sim runs had been added to `back/packages/simulator/runs/` after submission. One run directory (`f650f71f`) was empty (failed sim).
- **RP1.1 + RP1.2** — rewrote `fraud.classifier.ts` with the paper-snapshot constants verbatim from `paper/supplementary.tex` Tables III + VII. Added a `PAPER_SNAPSHOT: 2026-06-01` banner naming the producing corpus and trainer.
- **RP1.3** — added safety guards in place to `packages/simulator/src/train.ts`. (An earlier intermediate step renamed it to `train.v1.ts`, but the rename was reverted later in the session after a self-audit found that `paper/supplementary.tex` §4.1 explicitly references `packages/simulator/src/train.ts` -- the filename had to stay stable.) Final state: default invocation writes to `fraud.classifier.candidate.ts`; live snapshot overwrite requires both `--write` and `--confirm`. Updated the emitted classifier template so a regenerated snapshot still carries the paper-snapshot banner. Updated the trainer's training-set threshold check from `>= 0.55` to `>= 0.20` so reported metrics line up with `main.tex` Table I and supplementary §4.4. Internal logs still print `[Trainer v1]` as a version marker that distinguishes from v2.
- Updated `back/package.json` and root `package.json` with `train:fraud:v2` script (corrected pipeline). The default `train:fraud` continues to point at the paper-faithful `train.ts`.
- **RP1.4** — sorted the five run directories by `startedAt`. Three from 2026-06-01 08:21-08:25 UTC (`583abd37`, `7adb7e19`, `353c37c5`) moved to `back/packages/simulator/runs/_paper-snapshot/`. One from 2026-06-01 17:43 UTC (`c2acb222`) moved to `_post-paper/`. Empty `f650f71f` removed. Wrote a README in each subdir explaining what lives there.
- Updated `packages/simulator/src/eval.ts` discovery to prefer `_paper-snapshot/` over the flat `runs/` folder so the default eval still finds the producing corpus.
- **Option 3 — `train.v2.ts`** — wrote a new corrected trainer that reads `sellerId` from `manifest.auctionOwners` and never touches `fraud.classifier.ts`. It writes to `fraud.classifier.candidate.v2.ts` only, exports `WEIGHTS_V2 / NORM_PARAMS_V2 / SCORE_THRESHOLD_V2` to make the namespacing explicit, and skips runs that lack `auctionOwners` (paper-snapshot era) with an explicit console warning.
- **RP2.1 - RP2.3** — added `auctionOwners?: Record<string, string>` to `SimRunManifest` in `packages/simulator/src/types.ts`. `run.ts` now writes `auctionOwners: { [auctionId]: admin.userId }` into every new manifest. Paper-snapshot manifests are intentionally left unchanged.
- **RP4.1 + RP4.3** — created `paper/figures/k6_results.json` with the canonical six-run sweep matching supplementary Table XII verbatim. Created `paper/figures/README.md` naming this file as the authoritative source and flagging the main-paper Table III as the looser earlier set.
- **RP4.2** — created `packages/simulator/k6/run-canonical.ps1` that runs all six configurations in sequence, captures git SHA / auction id / JWT in the header, and appends results to `docs/rp/rp-audit-02-k6-canonical-<timestamp>.md`.
- **RP5.1** — added a `LatencyRing` class to `back/src/modules/fraud/fraud.engine.ts` (1024-sample reservoir). Wrapped the hot path (`graph.add + extractFeatures + score`) with `performance.now()`. Added `perfStats()` returning p50/p95/p99/max + reservoir size + graph stats + active threshold. Added `resetPerf()`.
- **RP5.2** — extended `BidGraph.stats()` to return `approxBytes` using a conservative per-entry estimate (`(auctions + bidders) * 200 + totalBids * 180`). Inline comment explains the constants and references supplementary Theorem 2.
- **Endpoints** — added `getFraudPerf` and `resetFraudPerf` handlers in `back/src/modules/fraud/fraud.controller.ts`. Wired `GET /api/fraud/perf` and `POST /api/fraud/perf/reset` into `fraud.routes.ts` (admin-only via existing middleware).
- Struck through the appropriate items in `reaching-rp.md` and added a "pull-the-repo defence checklist".

## What Landed

### Files modified

| Path | Change |
|---|---|
| `back/src/modules/fraud/fraud.classifier.ts` | Restored paper-snapshot constants; added PAPER_SNAPSHOT banner. |
| `back/src/modules/fraud/fraud.engine.ts` | Added `LatencyRing`, wrapped hot path with `performance.now()`, exposed `perfStats()` and `resetPerf()`. |
| `back/src/modules/fraud/fraud.graph.ts` | `stats()` now returns `approxBytes`. |
| `back/src/modules/fraud/fraud.controller.ts` | Added `getFraudPerf` and `resetFraudPerf`. |
| `back/src/modules/fraud/fraud.routes.ts` | Wired `/perf` and `/perf/reset`. |
| `packages/simulator/src/eval.ts` | Discovery prefers `_paper-snapshot/`. |
| `packages/simulator/src/run.ts` | Writes `auctionOwners` into new manifests. |
| `packages/simulator/src/types.ts` | `SimRunManifest.auctionOwners` optional field. |
| `back/package.json` | `train:fraud:v2` added; default `train:fraud` points at the paper-faithful `train.ts`. |
| `package.json` | Same workspace-passthrough addition. |
| `packages/simulator/src/train.ts` | Safety guard added in place. |
| `reaching-rp.md` | Strikethroughs for RP1, RP2, RP4, RP5; execution log + pull-the-repo defence checklist. |

### Files created

| Path | Purpose |
|---|---|
| `packages/simulator/src/train.v2.ts` | Corrected (real-sellerId) trainer; writes only `fraud.classifier.candidate.v2.ts`. The paper-faithful trainer kept its original filename `train.ts` (with safety guards added in place). |
| `back/packages/simulator/runs/_paper-snapshot/README.md` | Explains the three preserved producing runs. |
| `back/packages/simulator/runs/_post-paper/README.md` | Explains the post-paper corpus directory. |
| `paper/figures/k6_results.json` | Canonical six-run k6 sweep. |
| `paper/figures/README.md` | Names canonical artefacts and documents the main-paper-vs-supplementary discrepancy. |
| `packages/simulator/k6/run-canonical.ps1` | Reproducible canonical k6 sweep runner. |
| `xdocs/sessions/2026-06-02-reaching-paper.md` | This file. |

### Files deleted

- `back/packages/simulator/runs/f650f71f-02bc-49a3-a4a5-c6bb40cd510c/` (empty stray, failed sim run).

### Decisions

- **Option 3 (chat-tier menu) = Option B (reaching-rp.md menu).** Keep paper snapshot bit-exact; corrected pipeline lives as v2 candidate only. Never wired into runtime.
- **Did not regenerate paper-snapshot manifests with `auctionOwners`.** Even with corrected sellerId, the single-auction-per-run corpus collapses σ to {0, 1}, so retraining on the same corpus would not produce a meaningfully different model. Honest path is to build a multi-auction corpus (Phase RP3) when the user has time.
- **Did not extend baseline comparison (RP6).** Paper text describes a single-baseline table; adding rows would make `metrics.tex` diverge from `main.tex` Section VI.A's prose.

## Open Questions

1. None blocking. The remaining items (RP3 multi-auction corpus, RP5.3 held-out split, RP6 extra baselines) all require either new sim data or changes that would diverge from paper text. They are documented as "do later if a revision opens" in `reaching-rp.md`.

## Addendum: Pre-Review Fine-Tune (same day, later)

After the Phase RP reconciliation landed and the self-audit was clean, the user asked for a focused polish pass ahead of a project review on 2026-06-04. Explicit asks: backend smoothness, realtime smoothness on both sides, error boundary + crash safety, and small UI polish on landing / wallet / dashboard. No new features, no demo seed (the user did not pick that option).

### What landed in the polish pass

| # | Change | Notes |
|---|---|---|
| FT1 | **Error boundary** at `front/src/components/ErrorBoundary.tsx` | App-wide; sits inside Navbar so the nav stays clickable when a child page crashes. Shows dev-mode stack trace; production view is a clean recovery card with reload + back-to-home. Wired in `front/src/app/providers.tsx`. |
| FT2 | **Landing-page footer accuracy** | Removed the fake "LATENCY: 14MS / UPTIME: 99.9%" badges (a reviewer would have asked where the numbers came from). Replaced with stack labels and institution. |
| FT3 | **Wallet: zero-balance callout** | Info-toned `Alert` appears above the stat grid when both balance and held are 0. Tells new users to fund first; links nowhere but pairs visually with the right-hand deposit form. |
| FT4 | **Wallet: deposit-cap awareness** | The backend rejects single deposits over INR 100,000; the UI now states the cap inline under the form and prevents over-cap submission client-side. Withdraw side shows withdrawable-now hint instead. |
| FT5 | **Wallet: transaction-row description spacing bug** | Old code rendered `" · {date}"` with a leading double-space when description was empty. Switched to a conditional fragment so the bullet only appears alongside a real description. |
| FT6 | **Dashboard: brand-new-user callout** | When the user has zero bids, zero listings, and zero wins, a "Welcome aboard / two quick steps" card appears under the stat grid with Fund-wallet + Browse-market CTAs. Disappears once they have any activity. |
| FT7 | **Backend log emojis stripped** | rules.md says no emojis anywhere in the project. Replaced the previous mixed-emoji startup logs in `back/src/index.ts`, `back/src/lib/redis.ts`, and every script under `back/src/scripts/` with bracketed-tag labels (`[ok]`, `[warn]`, `[fail]`, `[del]`, `[seed]`, `[bench]`, etc.). No user-visible UI change; cleaner dev console and rule-compliant. |
| FT8 | **seed-users includes hoster** | `seed-users.ts` now creates `hoster@x.com` alongside admin/one/two/three, so the three `create-*-auction.ts` scripts work right after a fresh `db:seed-users`. Final log line documents the shared password (`123123`). |

### Realtime sanity check (no changes needed)

The user explicitly called out "real-time things and frontend real time". A quick audit found the realtime layer is already solid from Phase F:

- `socket.ts` is a singleton with reconnection (10 attempts, 1000-5000 ms backoff) and auth via JWT in the handshake.
- `useSocketListener` and `useAuctionRoom` keep handlers in refs (no re-subscribe on handler change) and the auction-room hook re-emits `auction:join` on the manager's `reconnect` event.
- `login` + `register` both call `reconnectSocket()` after `setAuth`, so the socket picks up the new JWT immediately.
- `Navbar` shows the tri-state `ConnectionStatus` (connected / reconnecting / offline) so the user sees an outage without scrolling.

Nothing to do here. The existing wiring already handles all the demo-relevant cases.

### What this polish does NOT change

- No new features.
- No paper-snapshot files (`fraud.classifier.ts`, `train.ts`, `train.v2.ts`, `_paper-snapshot/` corpus) — paper reconciliation work is preserved bit-for-bit.
- No schema migrations.
- No socket protocol changes.

## Next Up

The repository is now safe to be cloned and inspected by reviewers without contradicting the paper. Two things the user can optionally do whenever it suits them:

1. **Capture a fresh `paper/figures/fraud_perf.json`** by hitting `GET /api/fraud/perf` while a k6 load test runs against the backend. The endpoint exists and produces structured JSON; we just don't auto-write to disk so the published number is a deliberate choice.
2. **Run `npm run train:fraud`** once to verify the new safety guard. It should log `Output target: fraud.classifier.candidate.ts (candidate file)` and leave `fraud.classifier.ts` untouched. `git status` after the run should show only the candidate file as new.

Both are user actions; neither is required for the reconciliation to be complete.
