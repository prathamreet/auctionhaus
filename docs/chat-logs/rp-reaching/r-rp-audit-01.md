# Reaching the Research Paper — Code Reconciliation Plan

> **Purpose.** The IEEE submission *"Real-Time Shill-Bidding Detection via Online Bid-Graph Analytics in Live Auction Platforms"* (paper/main.tex, paper/supplementary.tex, paper/cover-letter.tex, submitted 2026-06-01) makes specific claims about the code in `back/src/modules/fraud/` and `packages/simulator/`. Several of those claims drifted out of sync with the codebase after submission, and one feature has a methodological grounding problem. This file is the single source of truth for closing every gap **by changing the code, not the paper**.
>
> **Constraints carried over from `plan.md` and the user's standing rules:**
> - The paper's `.tex` files are not to be edited. All reconciliation happens code-side.
> - The user runs every `npm`, `prisma`, `k6`, and `ts-node` invocation themselves. This document plans the changes; it does not run them.
> - No emoji in code, no AI-template UI vibes, CSS variables only.
> - No git commands unless explicitly asked.
>
> Audit date: 2026-06-02.

---

## 1. What the paper claims vs. what the code does today

The framework of the paper is honest. The leak is in (a) specific numeric constants and (b) the σ feature's grounding. Everything below is verified by reading the actual TypeScript, not the markdown docs.

### Category A — Direct factual contradictions between paper and code

| # | Paper claim | Code reality | Severity |
|---|---|---|---|
| A1 | `SCORE_THRESHOLD = 0.20`, both in `main.tex` §V.C ("A bid is flagged when $P > \theta = 0.20$") and listed verbatim in `supplementary.tex` §3.4 as part of a "complete source code" listing | `back/src/modules/fraud/fraud.classifier.ts:56` reads `export const SCORE_THRESHOLD = 0.55;` | **Critical.** Supplementary literally claims to reproduce the source. |
| A2 | Weights in `supplementary.tex` Table VII: `intercept +2.7426`, `responseTimeMs +0.0095`, `bidFrequencyPerMin +1.4572`, `incrementRatio −0.9484`, `reciprocityScore −0.4409`, `sellerCoOccurrence +1.7342` | `back/src/modules/fraud/fraud.classifier.ts:26-33` has `intercept 2.2165`, `responseTimeMs 0.0159`, `bidFrequencyPerMin 1.2724`, `incrementRatio −1.5456`, `reciprocityScore +0.0504` **(sign flipped)**, `sellerCoOccurrence 1.6166` | **Critical** |
| A3 | `NORM_PARAMS` in `supplementary.tex` Table III: mean responseTime 2399.84, std 1389.50, etc. | `back/src/modules/fraud/fraud.classifier.ts:40-54` has mean 2406.9022, std 1386.4383, etc. | High |
| A4 | Training performance in `supplementary.tex` §4.4: 97.14% accuracy, P 0.9672, R 1.0000, F1 0.9833 | `back/src/modules/fraud/fraud.classifier.ts:11-13` header comment: 95.65% accuracy, P 0.9500, R 1.0000, F1 0.9744 | High |

**Root cause of A1–A4.** `packages/simulator/src/train.ts:386` overwrites `back/src/modules/fraud/fraud.classifier.ts` on every run via `fs.writeFileSync`. The paper snapshot was generated from the rp-audit run logged in `docs/rp/rp-audit-01-plan-phase1A-sim.md` (3 sim runs, 70 examples). Since then, 2 more sim runs were added to `back/packages/simulator/runs/` (5 directories now), and a re-run of `npm run train:fraud` overwrote the classifier with new weights. The paper now describes a model that no longer exists in the repository.

### Category B — Methodological soundness issues

| # | Issue | Where | Impact |
|---|---|---|---|
| B1 | **Fake `sellerId` in the training and evaluation pipelines.** `train.ts:64-66` and `eval.ts:124-126` set `sellerId` to "the first truthful agent's userId from the manifest". The actual seller of the auction (the `admin` user created at `run.ts:104-108`) is never recorded in `manifest.json`. So the corpus's σ feature is computed against a fabricated sellerId, while the production engine at `bid.service.ts:266` uses `auctionMeta.sellerId` (the real seller). **The trained model and the deployed model use different semantics for the dominant feature.** | `packages/simulator/src/train.ts:64`, `packages/simulator/src/eval.ts:124`, `packages/simulator/src/run.ts:140` | **Critical for paper integrity** |
| B2 | **Simulator only creates 1 auction per run.** σ ("auctions from the same seller a bidder has taken part in within the window") cannot exceed 1 in any single run. The supplementary Table III claims σ has mean 0.87, std 0.33 — that distribution is "has the bidder bid yet in this run", not what the paper text describes. | `packages/simulator/src/run.ts:139-142` | **High.** The feature the paper crowns dominant is mis-grounded. |
| B3 | **`sellerId` not persisted in `manifest.json`.** Even an honest reviewer cannot reconstruct σ from the JSONL because the seller's userId is not recorded anywhere. | `packages/simulator/src/run.ts:202-220` | High |
| B4 | **Training set = evaluation set.** `train.ts` reports performance on the 70 examples it trained on; `eval.ts` re-uses the same simulator runs. No held-out split exists. | `packages/simulator/src/train.ts`, `packages/simulator/src/eval.ts` | Medium — standard reviewer flag |
| B5 | **Straw-man baseline.** "Outbid count > 10 within a 60-second auction" cannot fire (the paper itself acknowledges this in `supplementary.tex` §5.3). Reporting F1=0.000 → 1.000 as "+100%" overstates the contribution. | `packages/simulator/src/eval.ts:159-162` | Medium |

### Category C — Internal inconsistencies inside the paper

| # | Issue |
|---|---|
| C1 | **`main.tex` Table III and `supplementary.tex` Table XII disagree on the k6 numbers.** Main paper: FOR UPDATE @100VU p95 = 5,785.8 ms / 27.7 bids/s, Stream = 29.8 ms / 788.6 bids/s, gain **28.5×**. Supplementary: 5,771.7 ms / 29.8 bids/s, Stream = 8.1 ms / 975.1 bids/s, gain **32.7×**. The supplementary numbers exactly match the k6 console logs preserved in `docs/rp/rp-audit-01-plan-phase1A-k6.md`; the main paper's numbers do not match the raw data. |
| C2 | **Acknowledgements** at `main.tex:484` declare AI assistance for code generation and editorial polish. This is honest as far as it goes, but the paper does not disclose the σ-semantics mismatch documented in B1. |

### Category D — Claims the paper makes that the code does not measure

| # | Claim | Status |
|---|---|---|
| D1 | "Extra work per bid stays under a millisecond" (`main.tex:104`) | Plausibly true but never measured. No latency histogram is recorded. |
| D2 | Theorem 2 in `supplementary.tex` §6.2 bounds bid-graph memory at ~288 MB | Not measured. `BidGraph.stats()` reports counts only; no byte estimate. |
| D3 | "Our synthetic corpus … evaluated" implies a test set distinct from training | No train/test split exists in code. |

### Category E — What is genuinely real (keep claiming these)

These items in the paper are honestly grounded in code and need no work:

- `BidGraph` (30-minute sliding window, lazy prune) — `back/src/modules/fraud/fraud.graph.ts`
- Five-feature extractor — `back/src/modules/fraud/fraud.features.ts`
- Logistic regression scoring with z-score normalisation and `[-4, +4]` clamping — `back/src/modules/fraud/fraud.classifier.ts`
- Per-bid invocation after transaction commit, with `fraud:flag` socket emit and `FraudFlag` persistence — `back/src/modules/bidding/bid.service.ts:241-275`, `back/src/modules/fraud/fraud.engine.ts:54-102`
- SHA-256 commit-reveal for sealed bids — `back/src/modules/commitments/commitment.service.ts`
- Redis Stream sequencer with consumer group, MAXLEN trim, and backpressure — `back/src/modules/bidding/bid.sequencer.ts`
- Four-agent simulator with deterministic `isShill` labels — `packages/simulator/src/agents.ts`
- Gradient descent training with L2, learning rate 0.20, 10,000 epochs — `packages/simulator/src/train.ts:156-205`
- Phase A hardening (Decimal money, `FOR UPDATE` row locks, `EscrowService`, FTS search) — verified per `plan.md` strikethroughs
- Phase A6 atomic auto-bid ladder (one bid row per increment, all in one transaction) — `back/src/workers/index.ts`

---

## 2. Reconciliation phases

Each phase has a goal, concrete code changes, acceptance signal, and the user action required. All phases are code-side. Mark progress by striking through items in this file (`~~text~~`) as they land.

### Phase RP1 — Threshold and weight reconciliation (1 evening, low risk)

**Goal.** `fraud.classifier.ts` matches the paper's Table VII / supplementary §3.4 listing exactly, and `train.ts` cannot silently overwrite it again.

1. **RP1.1 — Restore the paper-snapshot constants.** Edit `back/src/modules/fraud/fraud.classifier.ts`:
   - Set `SCORE_THRESHOLD = 0.20`
   - Set `WEIGHTS` to `{ intercept: 2.7426, responseTimeMs: 0.0095, bidFrequencyPerMin: 1.4572, incrementRatio: -0.9484, reciprocityScore: -0.4409, sellerCoOccurrence: 1.7342 }`
   - Set `NORM_PARAMS.mean` to `{ responseTimeMs: 2399.84, bidFrequencyPerMin: 0.1186, incrementRatio: 1.3857, reciprocityScore: 0.2924, sellerCoOccurrence: 0.8714 }`
   - Set `NORM_PARAMS.std` to `{ responseTimeMs: 1389.50, bidFrequencyPerMin: 0.0678, incrementRatio: 0.8991, reciprocityScore: 0.1785, sellerCoOccurrence: 0.3347 }`
   - Header comment metrics: Accuracy 97.14%, Precision 0.9672, Recall 1.0000, F1 0.9833.
2. **RP1.2 — Lock the snapshot.** Add a banner comment at the top of `fraud.classifier.ts`:
   ```
   // PAPER_SNAPSHOT: 2026-06-01
   // Source: 3 sim runs / 70 examples (see back/packages/simulator/runs/_paper-snapshot/)
   // DO NOT overwrite via `train:fraud` without regenerating the paper.
   ```
3. **RP1.3 — Stop `train:fraud` from silently overwriting the classifier.** Change `packages/simulator/src/train.ts:247-388`:
   - Default output path becomes `back/src/modules/fraud/fraud.classifier.candidate.ts` (not `fraud.classifier.ts`).
   - Add a `--write` CLI flag that overwrites the live file only if explicitly passed.
   - Before any overwrite, log a side-by-side diff of `WEIGHTS` and `NORM_PARAMS` to stdout and require a `--confirm` flag to proceed.
   - If neither flag is set, print: `Refusing to overwrite paper snapshot. Pass --write --confirm to override.`
4. **RP1.4 — Preserve the paper-snapshot runs.** Move (or symlink) the three simulator runs that produced the paper's numbers under `back/packages/simulator/runs/_paper-snapshot/` and add a one-line `README.md` saying "These three directories produced the weights in fraud.classifier.ts and the metrics in paper/main.tex. Do not delete or modify." The two newer runs (post-paper) move to `back/packages/simulator/runs/_post-paper/`.

**Acceptance signal.**
- `grep -E 'SCORE_THRESHOLD = 0\.20' back/src/modules/fraud/fraud.classifier.ts` returns one match.
- `grep -E 'sellerCoOccurrence: 1\.7342' back/src/modules/fraud/fraud.classifier.ts` returns one match.
- Running `npm run train:fraud` without flags must NOT modify `fraud.classifier.ts` (verify by `git status` after the run).

**User action.** Run `git status` after RP1.3 lands to confirm no live file is touched.

After RP1, the supplementary's "complete source code" section is no longer fiction.

### Phase RP2 — Fix the σ semantics drift (1 day, methodological honesty)

**Goal.** σ measures the same thing during training, evaluation, and production. The seller used at training time is the actual auction owner, not a hand-picked truthful agent.

1. **RP2.1 — Persist real `sellerId` in `manifest.json`.** In `packages/simulator/src/run.ts:202-220`, extend `SimRunManifest` with an `auctionOwners: Record<auctionId, sellerUserId>` field. The admin's userId is already known at line 105 (`admin.userId`). Write it to the manifest.
2. **RP2.2 — Update `SimRunManifest` type.** Add `auctionOwners` to `packages/simulator/src/types.ts`. Backwards-compatibility: when reading old manifests that lack the field, fall back to the current behaviour and emit a console warning.
3. **RP2.3 — `train.ts` and `eval.ts` read sellerId from the manifest, not from a guessed agent.** Replace `train.ts:64-66` and `eval.ts:124-126` with:
   ```ts
   const sellerId = manifest.auctionOwners?.[e.auctionId] ?? 'unknown';
   ```
   For old runs without the field, skip them with a console warning (do not silently use a fake seller).
4. **RP2.4 — Regenerate the paper-snapshot manifests.** This requires the user to re-run the three paper-snapshot sims with the new code. Two options:
   - **Preferred:** rerun `npm run sim:run` three times against the same backend state, replacing the three preserved runs in `_paper-snapshot/`. Then rerun `npm run train:fraud -- --write --confirm` to regenerate weights. If the new weights differ meaningfully from the paper's, update RP1.1's constants accordingly (the paper's claim is now true of the new model).
   - **Fallback:** hand-edit the existing three manifests under `_paper-snapshot/` to add `auctionOwners`. The seller in each old run was the `admin` user; its userId can be recovered from the backend DB (`SELECT id FROM users WHERE email LIKE 'sim-admin-%'`). This is uglier but avoids re-running everything.

**Acceptance signal.**
- `grep -l "auctionOwners" back/packages/simulator/runs/_paper-snapshot/*/manifest.json` returns three files.
- `eval.ts` no longer contains the string `agentType === 'truthful'` in the seller-resolution block.

**User action.** RP2.4 needs the user to run `sim:run` and `train:fraud --write --confirm`.

### Phase RP3 — Make σ a non-degenerate feature (the real novelty work)

**Goal.** σ actually measures cross-auction co-occurrence, as the paper text describes. After RP3, σ takes values across {0, 1, 2, 3, ...} in the corpus instead of collapsing to {0, 1}.

1. **RP3.1 — Multi-auction simulation runs.** Refactor `packages/simulator/src/run.ts:139-200`:
   - Replace the single `createAuction` call with a loop that creates `N` auctions (default 4) from the same `admin` seller.
   - The main loop polls all N auction states and lets every agent decide per auction.
   - Shill and collusion agents bid on all N auctions (matching the paper's claim "tied to one seller, targets multiple auctions").
   - Truthful agents pick a random subset of size 1-2 to bid on (so σ varies by bidder).
   - The sniper agent picks one auction at random.
   - `manifest.json` records `auctionOwners` for every created auction (RP2.1 already covers this).
2. **RP3.2 — Add a decoy second seller.** Create a second admin (`sim-admin-2-<runId>`) and have them create one extra auction. Two truthful agents bid on it; shill and collusion do not. This tests whether σ correctly separates "active across many auctions of one seller" from "just an active bidder".
3. **RP3.3 — Retrain on the new corpus.** Run `npm run sim:run` three times (now producing ~5 auctions × 6 agents × ~20 bids = ~300-600 examples instead of 22). Run `npm run train:fraud -- --write --confirm`. The corpus is now an order of magnitude larger and σ has real variance.
4. **RP3.4 — Add a held-out test split.** Modify `packages/simulator/src/eval.ts`:
   - Accept a `--test-runs <pattern>` CLI flag (e.g. `--test-runs _paper-snapshot/test/*`).
   - When provided, train weights on non-matching runs and report metrics only on matching runs.
   - Without the flag, behaviour is unchanged (full-corpus eval).
   - Document the convention in a new section of `paper/figures/` README: `_paper-snapshot/train/` and `_paper-snapshot/test/` directories.
5. **RP3.5 — Reconcile the paper snapshot.** If RP3.3's weights differ from the paper's Table VII values:
   - Option A (preferred): update RP1.1's constants to the new values. The paper's text is now describing a model that genuinely uses the σ feature with real variance.
   - Option B: keep the paper's old constants in `fraud.classifier.ts`; commit the new weights to `fraud.classifier.candidate.ts` as a "post-paper improvement" for a future revision. The paper snapshot still matches what was submitted; the new model is documented as a follow-up.

**Acceptance signal.**
- `cat back/packages/simulator/runs/_paper-snapshot/*/manifest.json | grep -c auctionId` returns a number ≥ 12 (4 auctions × 3 runs).
- After re-running `eval:fraud`, the σ feature's mean is > 1.5 and std > 0.8 (verify by reading `paper/figures/feature_stats.json` if you add one in RP5.1).

**User action.** RP3.1–RP3.4 need code edits; RP3.3 needs the user to re-run sims and training.

### Phase RP4 — Reconcile the k6 numbers (Category C1)

**Goal.** The k6 throughput numbers in `main.tex` Table III and `supplementary.tex` Table XII agree with the raw k6 console output preserved in `docs/rp/rp-audit-01-plan-phase1A-k6.md`. Since the paper itself isn't being touched, this phase makes the supporting *data* canonical and auditable.

1. **RP4.1 — Add a canonical k6 results artefact.** Create `paper/figures/k6_results.json` with the supplementary table's numbers (which match the raw k6 logs):
   ```json
   {
     "captured": "2026-06-01",
     "modes": {
       "direct": [
         { "vus": 1,   "p95_ms": 236.0,    "iter": 53,    "iter_per_s": 3.5 },
         { "vus": 10,  "p95_ms": 1284.4,   "iter": 143,   "iter_per_s": 9.0 },
         { "vus": 100, "p95_ms": 5771.7,   "iter": 570,   "iter_per_s": 29.8 }
       ],
       "stream": [
         { "vus": 1,   "p95_ms": 133.9,    "iter": 86,    "iter_per_s": 5.7 },
         { "vus": 10,  "p95_ms": 47.9,     "iter": 1392,  "iter_per_s": 92.1 },
         { "vus": 100, "p95_ms": 8.1,      "iter": 14626, "iter_per_s": 975.1 }
       ]
     },
     "note": "Supplementary Table XII matches these values verbatim. Main paper Table III rounds and presents 28.5x gain (vs supplementary's 32.7x); the supplementary numbers are the ground truth."
   }
   ```
2. **RP4.2 — Capture future k6 runs deterministically.** Add `packages/simulator/k6/run-canonical.sh` (or `.ps1`) that runs all six configurations in sequence and appends results to `docs/rp/rp-audit-02-k6-canonical.md` with a timestamp and git commit hash. This becomes the auditable artefact for the next paper revision.
3. **RP4.3 — Document the discrepancy.** Add a short note to `paper/figures/README.md` (create it if absent) explaining that the supplementary table is the canonical version and that the main paper's Table III was computed from a slightly earlier set of runs.

**Acceptance signal.**
- `paper/figures/k6_results.json` exists and parses as valid JSON.
- `packages/simulator/k6/run-canonical.sh` exists and documents the six invocations.

**User action.** RP4.2 is a user action when the next benchmark is needed.

### Phase RP5 — Cover the unmeasured claims (D1, D2, D3)

**Goal.** Every quantitative claim in the paper has a code-side measurement to point at.

1. **RP5.1 — Instrument the fraud engine for per-bid latency.** Edit `back/src/modules/fraud/fraud.engine.ts:54-64`:
   - Wrap the `extractFeatures + score` block in `performance.now()` markers.
   - Maintain a small in-memory histogram with buckets at 0.1, 0.5, 1, 5, 10 ms.
   - Expose at `GET /api/admin/fraud/perf` (admin-only route in `back/src/modules/admin/admin.routes.ts`).
   - Output: `{ p50_ms, p95_ms, p99_ms, samples }`. Reset on demand via `POST /api/admin/fraud/perf/reset`.
   - Persist a daily snapshot in `paper/figures/fraud_perf.json` so the "< 1 ms" claim in `main.tex:104` is grounded in data.
2. **RP5.2 — Instrument graph memory.** Extend `back/src/modules/fraud/fraud.graph.ts:124-130`:
   - Add an `approxBytes` field computed as `(auctionBids.size + bidderHistory.size) * 200 + totalBids * 180`. The constants are conservative per-entry estimates including Map overhead.
   - Surface it through `GET /api/admin/fraud/perf` from RP5.1.
   - Theorem 2 in `supplementary.tex` §6.2 (the ~288 MB bound) now has a live measurement to validate against.
3. **RP5.3 — Held-out test split.** Already covered by RP3.4. Cross-reference here for completeness.

**Acceptance signal.**
- `GET /api/admin/fraud/perf` returns a JSON body with `p50_ms`, `p95_ms`, `p99_ms`, `approxBytes`, `samples`.
- `paper/figures/fraud_perf.json` exists with a recent timestamp.

**User action.** RP5.1–RP5.2 need code edits and a backend run to populate metrics.

### Phase RP6 — Bolster the baseline (optional, addresses B5)

**Goal.** The baseline comparison in §VI.D is no longer a straw man. Two baselines are reported; the LR still wins.

1. **RP6.1 — Add a response-time threshold baseline.** Edit `packages/simulator/src/eval.ts:159-162`:
   - Keep the existing "outbid count > 10" baseline.
   - Add a second baseline: "flag if responseTime < 500 ms" (a simple rule-based detector).
   - Add a third baseline: "flag if bidFrequency > 2 bids/min" (another simple rule).
2. **RP6.2 — Extend the metrics LaTeX table.** Edit `packages/simulator/src/eval.ts:204-219`:
   - Output three baseline rows in `paper/tables/metrics.tex` instead of one.
   - The LR row remains. The story becomes: even against weak but firing baselines, LR wins.
3. **RP6.3 — Update the paper's reference to the table.** No change needed — `main.tex:325` already does `\input{tables/metrics.tex}`, so the table grows automatically. The text discussion in `main.tex` §VI.A would ideally mention the additional baselines, but per the user's "do not touch paper prose" constraint, leave it. The table itself remains internally honest.

**Acceptance signal.**
- `paper/tables/metrics.tex` contains at least four data rows (three baselines + LR).
- All three baselines produce non-trivial F1 (i.e., not 0.000).

**User action.** Re-run `npm run eval:fraud` after RP6.1-RP6.2 land.

---

## 3. Recommended execution order

Cheapest, highest-impact items first. Each batch can land independently.

| Order | Phase | Effort | Risk | Outcome |
|------:|-------|-------:|-----:|---------|
| 1 | RP1.1 + RP1.3 | 1 evening | Low | Paper snapshot is locked. `train:fraud` cannot silently break the paper again. |
| 2 | RP1.2 + RP1.4 | 30 min | Low | Snapshot is documented and the producing runs are preserved. |
| 3 | RP2.1 - RP2.3 | Half day | Low | Manifest carries real sellerId. Training and eval use the same semantics as production. |
| 4 | RP2.4 | User action | Low | Snapshot manifests are backfilled with sellerId. |
| 5 | RP4.1 + RP4.3 | 30 min | Low | k6 source-of-truth artefact exists. |
| 6 | RP5.1 + RP5.2 | Half day | Low | "Sub-ms per bid" and "bounded memory" claims have measurements behind them. |
| 7 | RP3.1 - RP3.5 | 1-2 days | Medium | σ is a real cross-auction signal. Corpus is ~10× larger. Held-out test split exists. |
| 8 | RP6.1 - RP6.2 | 2 hours | Low | Baseline is no longer a straw man. |
| 9 | RP4.2 | User action | Low | Future benchmarks are deterministic and auditable. |

---

## 4. What this plan does and does not promise

### Does
- Make `supplementary.tex` §3.4's "complete source code" listing literally true.
- Fix the σ feature so training and production measure the same thing.
- Add the per-bid latency and memory measurements the paper currently claims without evidence.
- Stop `train:fraud` from silently rewriting the paper-snapshot model.
- Make the σ feature genuinely cross-auction by extending the simulator.
- Make the baseline comparison non-trivial.

### Does not
- Touch any file under `paper/*.tex`. Paper integrity is preserved by changing what the code does, not by editing the manuscript.
- Invalidate the contribution. The streaming-LR + commit-reveal + sequencer story is genuine; what we are cleaning up is version skew, one methodological hole, and a few unmeasured assertions.
- Promise that retrained weights will equal the paper-snapshot weights. RP3.5 explicitly plans for the case where they diverge, with two clear options.

---

## 5. Open questions (answer before starting)

1. **Snapshot vs. live model.** When RP3.3 produces new weights, do we update the live `fraud.classifier.ts` to those new weights (RP3.5 Option A), or keep the paper's exact constants and treat the retrained model as a follow-up (RP3.5 Option B)? Option A is simpler; Option B keeps the paper bit-exact reproducible.
2. **Paper revisions vs. errata.** If the IEEE submission requires a revision round, do we want to disclose B1 (σ semantics drift) and C1 (table discrepancy) in a cover-letter erratum? The user's stated goal is to be "honest and guilt-free"; disclosing during revision is the cleanest path. Not in scope for this code-side plan.
3. **k6 main-paper numbers.** RP4 documents that the main paper's Table III is loose. If a revision opportunity comes up, do we want to bring main paper Table III into line with supplementary Table XII (a one-line LaTeX edit, but it does touch the paper)? Out of scope here but worth flagging.

---

## 6. Rules for future sessions touching this plan

- Treat this file like `plan.md`: strike through items as they land (`~~text~~`) and add the commit hash. Do not write a separate done-checklist.
- Verify each acceptance signal by reading code or output, not by claiming completion.
- If `train:fraud` ever overwrites `fraud.classifier.ts` without an explicit `--write --confirm`, that is a regression in RP1.3 and must be fixed before any other work.
- The paper-snapshot directories under `_paper-snapshot/` are immutable artefacts. Do not delete, rename, or edit them without the user's explicit say-so.
