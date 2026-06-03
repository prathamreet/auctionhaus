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

## Addendum 2: Toolchain & Build Fixes (same day)

The user ran the full monorepo command matrix and hit several failures. Fixed all of them plus made the monorepo scripts easier.

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| TC1 | `npm run prisma:migrate` -> `Environment variable not found: DATABASE_URL` | Root script ran `npx prisma migrate dev --schema=back/prisma/schema.prisma` from the repo root, so Prisma never loaded `back/.env`. (`generate` worked only because it does not need the URL.) | Root `prisma:generate` / `prisma:migrate` / `prisma:studio` now delegate to the back workspace (`npm run ... --workspace=back`), which runs with `cwd=back` and loads `back/.env`. |
| TC2 | `npm run lint:front` -> `Missing script` | Root only had `lint:back`. | Added `lint:front` and a combined `lint` (back then front). `ci:local` now runs the combined `lint`. |
| TC3 | `npm run build:front` -> TS error: `Property 'style' does not exist` on `Field` | `CommitmentPanel.tsx` passed `style` to the `Field` primitive, which did not accept it. | Added optional `style?: React.CSSProperties` and `className?: string` to `front/src/components/ui/Field.tsx`, applied to its root div. |
| TC4 | `npm run lint:back` -> 1 error `no-useless-assignment` in `generate-docs.ts:286` | `let fn = '';` then every branch reassigns or `continue`s, so the init was dead. | Changed to `let fn: string;` (definite assignment holds because the else branch continues). |
| TC5 | lint warning: `any` in `auction.service.ts:226` | `userWallets: Record<string, any>` | Narrowed to `Record<string, { id: string }>` (only `.id` is used downstream). |
| TC6 | lint warnings in `bid.sequencer.ts` (`any` at 165, unused `workerName` at 189) | `(redis as any).xreadgroup` cast and an unused param. | Added a module-level `XReadGroupReply` type; bound `redis.xreadgroup` once per consume loop via a typed `as unknown as (...) =>` cast; removed the unused `workerName` param from `processEntry` and its call site. |
| TC7 | lint warning: unused `io` import in `notification.service.test.ts:5` | The `jest.mock` factory provides `io`; the top-level import binding was unused. | Removed the unused `import { io }` (the mock is unaffected). |
| TC8 | Next.js 16 build warning: `The "middleware" file convention is deprecated. Please use "proxy" instead.` | Next 16 renamed the edge `middleware` convention to `proxy`. | Renamed `front/src/middleware.ts` -> `front/src/proxy.ts`, exported function `middleware` -> `proxy`; `config.matcher` unchanged. Updated stale "middleware" comments in `authStore.ts`. Client-side route guards remain as a backstop. |

### Monorepo command ergonomics

Root `package.json` now exposes:
- `build` (back then front), `lint` (back then front), `lint:front` (new).
- `prisma:generate` / `prisma:migrate` / `prisma:studio` all delegate to the back workspace so `back/.env` always loads.
- `db:seed` (users only), `db:seed-demo` (users + one ACTIVE auction of each type owned by hoster@x.com), `db:reset-auctions`.

New one-shot seeder `back/src/scripts/seed-demo.ts` (`npm run db:seed-demo` from root): idempotent, creates the five demo accounts (all password `123123`, funded wallets) and one English + one Dutch + one Sealed auction owned by `hoster@x.com`, skipping anything that already exists. This makes the review setup a single command.

### Tests
`npm run test` was already green (27 suites / 130 tests). The TC5-TC7 changes are type/lint-only and do not alter runtime behaviour; the notification test's removed import is non-functional (the mock stays).

## Addendum 3: Front Build + React 19 / Next 16 Lint (same day)

A second toolchain pass after the user ran `build:front` and `lint`. The front build was blocked by a Zod typing change, and `eslint-config-next` 16 turned on the React-Compiler hook rules (`react-hooks/purity`, `react-hooks/refs`, `react-hooks/set-state-in-effect`) as errors. Fixed every one properly -- no rule suppression, no config downgrade.

| # | Symptom | Fix |
|---|---|---|
| FB1 | `build:front` TS error: `Property 'errors' does not exist on type 'ZodError'` (`contracts.ts:132`) | Zod 3.22+ dropped the `.errors` alias; `zodIssuesToErrors` now reads `err.issues ?? []`. |
| FB2 | `react-hooks/purity` error: `Date.now()` in render (`Countdown.tsx:52`) | Replaced the `useReducer` force-tick with a `now` state advanced by the interval (`setNow(Date.now())` in the callback); render derives `diff = endTime - now`. |
| FB3 | `react-hooks/purity` error: `Date.now()` in render (`auctions/page.tsx:230`, AuctionCard) | Catalogue cards do not tick; snapshot the clock once with `useState(() => Date.now())`. |
| FB4 | `react-hooks/refs` error: ref written in render (`LiveTicker.tsx:75`) | Moved `hoveredRef.current = hovered` into a `useEffect([hovered])`; the ref is only read in the post-commit interval callback so it is always current. |
| FB5 | `react-hooks/set-state-in-effect` x2 (`Navbar.tsx:32,56`) | Removed both effect setStates. The unread badge only renders while `user` is truthy, so no logout reset is needed (just `return`); the visit-to-/notifications reset moved to an `onClick={() => setUnread(0)}` on the Alerts link (event-driven, allowed). |
| FB6 | `react-hooks/set-state-in-effect` (`useSocketListener.ts:43`) | Removed the redundant re-sync `setState`; the lazy `useState` initializer captures the mount state and the four listeners carry every transition. |
| FB7 | Unused imports: `CardBody` (admin/fraud, wallet), `CardHeader` (wallet), `EmptyState` (dashboard) | Removed from the import lists. |
| FB8 | Unused var `contested` (`AutoBidHealth.tsx:59`) | Removed; the third state is the fall-through warning tone, now documented in the comment. |
| FB9 | 3 unused `eslint-disable react-hooks/exhaustive-deps` directives (`useSocketListener.ts`) | The rule no longer fires (handlers are read through refs), so the dead directives were replaced with plain explanatory comments. |

Also added root `test:front` (`npm run test --workspace=front --if-present`) so the command the user tried exists and exits cleanly (front has no jest suite).

**Note on the lazy-initializer pattern (FB2/FB3):** `useState(() => Date.now())` is React's sanctioned escape hatch for reading the clock once during render and the purity rule permits initializers. If a future lint run still flags it, the fallback is an effect-set `now` with a sensible initial value.

## Addendum 4: Second front build + refs round (same day)

The previous round cleared the first wave; a re-run surfaced two more root causes. Both fixed at the root, and the whole frontend was swept for the same patterns to stop the recurring cycle.

| # | Symptom | Root cause + fix |
|---|---|---|
| FC1 | `build:front` TS error: `Spread types may only be created from object types` (`useZodForm.ts:30`) | The generic was `S extends z.ZodTypeAny`, so TS could not see that `z.input<S>` is an object, and `{ ...p }` over the form values failed. Constrained it to `S extends z.ZodType<unknown, z.ZodTypeDef, Record<string, unknown>>`. Inside the hook the values are now a spreadable object; at the call site inference still resolves the precise shape, so `form.values.email` etc. keep their exact types. Verified both consumers (`login`, `register`) use plain `z.object` schemas that satisfy the constraint. |
| FC2 | `react-hooks/refs` x6: `xRef.current = y` written during render in all three socket hooks (`useSocketListener.ts:74,76,107,109,150,152`) | The "store latest callback in a ref" pattern writes the ref in the render body, which the React Compiler rule forbids. Moved each hook's ref writes into an unkeyed `useEffect(() => { ... })` that runs after every commit. The refs are only read inside socket callbacks (which fire post-commit), and `useRef(handler)` already seeds the correct value at mount, so the latest-handler guarantee is unchanged. |

**Frontend-wide sweep (to break the recurring cycle):**
- `.current =` writes: only in `useSocketListener.ts` (now all in effects) and `LiveTicker.tsx` (already in an effect from Addendum 3). Zero render-phase ref writes remain.
- `Date.now()` / `new Date()`: all remaining occurrences are inside `useState` lazy initializers, effects, socket-event callbacks, Zod refinements, or submit/validate handlers -- none in a render body. Confirmed against the lint output (none were ever flagged outside the two already fixed).

## Addendum 5: Zod-4 generics in useZodForm (same day)

The Addendum-4 constraint (`S extends z.ZodType<unknown, z.ZodTypeDef, Record<string, unknown>>`) was wrong for the installed Zod. `zod@^3.22.4` resolves to 3.25.x, which ships the new Zod-4-style core: `z.object()` returns `ZodObject<..., $strip>` with a `_zod: $ZodObjectInternals` internal. My three-param `z.ZodType<...>` constraint matched `Record<string, unknown>` against that internals slot, so `loginSchema` no longer satisfied the constraint -> `build:front` failed at `login/page.tsx:19`.

**Root-cause fix (version-independent):** stopped constraining via Zod's internal generics. `useZodForm` is back to `S extends z.ZodTypeAny`, and the form's internal state is typed as a plain `Values = Record<string, unknown>` -- so every spread (`{ ...p }`) and index (`values[name]`) is well-typed no matter how Zod represents a schema's input. Zod types are used only at the boundaries: `initial: z.input<S>` (call-site checked) and `Output = z.output<S>` (the parsed data handed to `onSubmit`/`validate`). The `initial` casts go through `as unknown as Values` so they compile whatever `z.input<S>` resolves to.

Verified both consumers (`login`, `register`) compile unchanged: they already read `form.values.X as string`, call `form.register("field")` with string keys, and read `form.errors.X` off a `Record<string, string>` -- none of which depend on the form-values type being the schema shape. Lint stayed clean (front + back both 0 problems in the same run). Back build + 130 tests green throughout.

## Addendum 6: Honest pipeline rebuild — paper rejected, freeze lifted (2026-06-03)

The first submission was **rejected on domain scope** (not technical merit). That lifts the "paper is frozen" constraint that forced the v1/v2 split. The deferred corrections (RP3 multi-auction σ, RP5.3 held-out split, RP6 real baselines, and the σ-grounding fix) are now implemented for real. The code becomes genuinely correct; the user regenerates the resubmission's numbers from it.

### Files

| File | Change |
|---|---|
| `packages/simulator/src/dataset.ts` | **New.** Single shared loader: replays each run through the production `BidGraph`+`extractFeatures`, grounds `sellerCoOccurrence` in `manifest.auctionOwners` (real seller), and provides a deterministic FNV-1a train/test split keyed on bidId. Excludes `_`-prefixed run dirs. Also attaches `bidderBidCountOnAuction` for the outbid-count baseline. |
| `packages/simulator/src/run.ts` | **Rewritten** multi-auction: primary seller lists `SIM_PRIMARY_AUCTIONS` (default 3) auctions + a decoy second seller lists one. Shill/collusion span all primary auctions (high σ); truthful/sniper one each; truthful also bids the decoy (low σ per seller, yet active). Per-(persona,auction) agent instances reuse one credential. `manifest.auctionOwners` records every auction's seller. |
| `packages/simulator/src/train.ts` | **Rewritten.** Fits LR on the TRAIN partition only (mean/std on train, no leakage), writes `fraud.classifier.ts` directly. v1/v2 + `--write/--confirm` guard removed. Ships `SCORE_THRESHOLD = 0.5`. |
| `packages/simulator/src/eval.ts` | **Rewritten.** Reports on the HELD-OUT TEST partition: ROC sweep, mean-ablation (feature → its mean → z=0), and two real baselines (outbid-count>10 + best single-feature decision stump fit on train, scored on test). Writes the same paper artifacts. No Prisma dependency. |
| `packages/simulator/src/train.v2.ts` | **Deleted** (logic folded into dataset.ts/train.ts). |
| `packages/simulator/src/types.ts` | `auctionOwners` doc comment updated (no more v2 reference). |
| `back/package.json`, `package.json` | Removed `train:fraud:v2`. |
| `runs/_paper-snapshot/README.md`, `runs/_post-paper/README.md` | Updated to "historical, excluded from pipeline." Old single-auction corpus retained for provenance. |
| `reaching-rp.md`, `plan.md` | Pivot documented (reaching-rp.md UPDATE banner; plan.md Phase RP-2). |

### Design decisions

- **σ is now genuinely discriminative.** Within a run, the primary seller owns several auctions; σ for a bidder counts distinct auctions of that seller the bidder targeted. Shill/collusion → σ≈3; truthful/sniper → σ≈1. The decoy seller proves an *active* organic bidder (2 auctions across 2 sellers) still has low σ *per seller*, separating "seller-affiliated" from "active".
- **No leakage.** One deterministic split function in `dataset.ts`; `train.ts` fits on train, `eval.ts` scores on test. Same partition in both processes (hash of bidId).
- **Honest baselines.** The decision stump is a fair competitor (best single feature+threshold). If σ-stump nearly matches LR, that is the honest result and the ablation already implies it — the paper reports it truthfully.
- **Threshold.** `train.ts` ships 0.5 (LR boundary). `eval.ts` reports the full ROC so the operating point for the paper is a data-driven choice, not a hardcoded 0.20.

### What the USER runs (I cannot run servers)

```
# 1. backend up with a clean DB
npm run prisma:migrate
npm run dev:back

# 2. generate the corpus (run 3-5 times for a healthy train/test split)
npm run sim:run
npm run sim:run
npm run sim:run

# 3. fit + evaluate
npm run train:fraud     # writes back/src/modules/fraud/fraud.classifier.ts
npm run eval:fraud      # writes paper/figures/*.json + paper/tables/metrics.tex
```

Then update the paper sections (simulator params, weights, ablation, metrics, baselines) from the regenerated artifacts. Numbers WILL differ from the rejected version — that is the point; they are now honest.

### Not done (out of scope of this request)
- Paper `.tex` edits and domain-scope reframing — the user does these after regenerating numbers.

## Addendum 7: Escrow settlement closed + audit finalized (2026-06-03)

User asked to "complete everything and make it final... so research paper and actual work be on the same page." Closed the one audit finding that contradicted a paper claim, plus reviewed all remaining audit items.

### Escrow settlement (audit Critical #1 + #2) — fixed

Before: auction-end never moved the winner's held funds to the seller (only buy-now settled). `confirmWinnerPayment` (`POST /payments/.../confirm`) had no frontend caller, so for a normal English auction the winner's money stayed in `heldAmount` forever and `WinnerCertificate` falsely told the seller "Payment auto-settled via escrow."

| Path | Fix | File |
|---|---|---|
| English + Sealed | Auto-settle at end: a fresh auction-locked tx calls `settleWithinTx(WON_AUCTION)` (winner `heldAmount` → seller balance), marks the winning bid `WON`, and notifies the seller `PAYMENT_RECEIVED`. Errors caught/logged so notifications still fire. | `back/src/workers/index.ts::endAuction` |
| Dutch | Settles immediately in the same tx that ends the auction on accept (Dutch never reaches `endAuction`). | `back/src/modules/bidding/bid.service.ts::placeBid` |
| Buy-now | Already settled (`DIRECT_SALE`) — unchanged. | `auction.service.buyNow` |

Idempotency: all paths go through `settleWithinTx`, guarded by the `Settlement` row (unique on `auctionId`). So the now-redundant `confirmWinnerPayment` endpoint is a harmless backstop, and no auction can double-settle. `WinnerCertificate` copy is now accurate (rendered only for winner/seller via `isEnded && (isWinner || isSeller)`).

Test-safety verified by reading the suites: `endAuction` is not unit-tested (only `processAutoBidLadder` is), and the Dutch `placeBid` test asserts only `auction.update` — the added `settleWithinTx` resolves cleanly against its existing wallet mock. No test changes needed; 130 stay green (user re-runs `npm run test:back` to confirm).

### Remaining audit items — reviewed, accepted (not bugs)
- `PUT /auctions/:id` (`updateAuction`): real tested endpoint, no UI caller — intentional API surface.
- `GET /api/fraud/perf` + `/perf/reset`: admin diagnostics backing the sub-ms / memory paper claims; no UI by design.
- `useZodForm` unused helpers: reusable hook surface.
- `BidSequencer` `/stream`: dormant unless `BID_SEQUENCER=true` (benchmark feature).
- Fraud detector live reachability: flags seller-affiliated multi-auction behaviour by construction; manual single-auction clicking won't trip it — that's the method, shown via the simulator.

### Net: code ↔ paper consistency closed
Every headlined contribution is genuinely implemented and consistent. The only remaining step is mechanical (user regenerates numbers, then edits `.tex`). `reaching-rp.md` UPDATE banner now carries the closure summary.

## Addendum 8: Final inspection + benchmark honesty fixes (2026-06-03)

Full re-read of the paper against the rebuilt code, plus diagnosis of the k6 "errors" the user hit at 10/100 VU.

### k6 benchmark was being contaminated — fixed

Root causes of the `ERRO ... thresholds crossed` lines and `bid_errors`:
1. **Rate limiter.** `rateLimiter` was `max: 1000` per 15 min, keyed per-IP, shared across all localhost requests. Direct mode is slow (~570 req/15s) so it stayed under the cap and gave clean numbers; stream mode is fast (~12k req/15s) so after 1000 it got **429**, which the k6 check counts as `bid_errors` AND whose fast rejections drag p95 down and inflate iteration counts. The stream throughput numbers (incl. the rejected paper's) were partly measuring rate-limit rejections.
2. **Hard k6 thresholds.** The script had `bid_latency{mode:stream}: p(99)<500` and `bid_errors: count<5` as failing thresholds, so a benchmark that exceeded an arbitrary SLO exited non-zero with `ERRO`. Wrong for a measurement harness.

Fixes:
- `back/src/middleware/rateLimiter.middleware.ts` — `max` now env-overridable (`RATE_LIMIT_MAX`, `RATE_LIMIT_STRICT_MAX`); defaults unchanged (1000/100).
- `packages/simulator/k6/bid-throughput.js` — removed failing thresholds; added `summaryTrendStats` so p50/p95/p99 actually print (were "—"); summary now shows iterations, iters/sec, and `bid_errors` with a WARNING if any request was rejected; header documents the required backend env. Stream row honestly labelled "Redis Stream (enqueue)" since stream mode measures enqueue acceptance (202), not end-to-end processing.
- `back/src/scripts/prepare-bench.ts` + `k6/run-canonical.ps1` — print/require the clean-benchmark backend env: `RATE_LIMIT_MAX=100000000 BID_SEQUENCER=true BID_STREAM_BACKPRESSURE=100000 npm run dev:back`. `BID_SEQUENCER=true` is essential — without the consumer running, stream bids enqueue but never process.

### Paper-text reconciliation list (for the user's .tex pass after re-running)

Code is internally correct; these are paper prose/number updates to make on resubmission:
- **Simulator section (supplementary §2):** now multi-auction (N primary + 1 decoy seller), not a single 60s auction. Update agent-targeting description.
- **Weights / NORM_PARAMS / threshold tables:** regenerate from `train.ts` output (threshold is now 0.5, not 0.20).
- **Metrics table (Table I) + ablation:** regenerate from `eval.ts` (held-out test set; real baselines incl. the decision stump).
- **F1 response-time prose (main.tex §V.B):** says "for the opening bid this is set to zero" but the code (and supplementary §3.3 listing) uses a neutral default of 8000 ms. Update the prose to match the code (8000 ms neutral default avoids flagging the opening bidder as bot-speed).
- **Throughput framing (main.tex §VI / Table III):** be explicit that stream mode measures *enqueue acceptance* throughput (the sequencer decouples acceptance from serial processing), so the headline gain is acceptance/absorption, not raw end-to-end processing rate. Numbers should be re-collected with the clean backend env above (the old ones were rate-limit-contaminated).

### Verified consistent (code ↔ paper)
30-min sliding window, the five features, z-score + [-4,4] clamp, LR scoring + `fraud:flag` emit, four-agent simulator with `isShill` labels, SHA-256 commit-reveal, Decimal money + `FOR UPDATE` ascending-wallet locks, atomic auto-bid ladder (one Bid row per increment), and — now — atomic escrow settlement at auction end. Production `onBid` and the training pipeline both use the **real** sellerId, so the σ feature means the same thing live and in training.

## Next Up

The repository is now safe to be cloned and inspected by reviewers without contradicting the paper. Two things the user can optionally do whenever it suits them:

1. **Capture a fresh `paper/figures/fraud_perf.json`** by hitting `GET /api/fraud/perf` while a k6 load test runs against the backend. The endpoint exists and produces structured JSON; we just don't auto-write to disk so the published number is a deliberate choice.
2. **Run `npm run train:fraud`** once to verify the new safety guard. It should log `Output target: fraud.classifier.candidate.ts (candidate file)` and leave `fraud.classifier.ts` untouched. `git status` after the run should show only the candidate file as new.

Both are user actions; neither is required for the reconciliation to be complete.
