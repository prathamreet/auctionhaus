## TL;DR — making the code match the submitted paper

The paper is frozen. Code can move; paper can't. Here's the honest split.

### CAN do (paper-faithful, low risk)

| What | Why it works |
|---|---|
| **Pin weights, threshold, normparams in `fraud.classifier.ts` back to the paper's exact values** (RP1.1) | The training script overwrote them post-submission. Restoring them is a 5-minute edit. The supplementary's "complete source code" section becomes literally true. |
| **Lock `train.ts` so it can't silently overwrite `fraud.classifier.ts`** (RP1.3) | Default output goes to `fraud.classifier.candidate.ts`. Live file only overwritten on `--write --confirm`. Snapshot stays safe. |
| **Preserve the 3 sim runs that produced the paper's numbers under `_paper-snapshot/`** (RP1.4) | The 5 runs currently in `back/packages/simulator/runs/` get split: 3 paper-snapshot, 2 post-paper. |
| **Add per-bid latency instrumentation** (RP5.1) | Paper claims "< 1 ms per bid" but never measures it. Adding `performance.now()` around the score block and exposing `/api/admin/fraud/perf` validates the claim. Does not change the model. |
| **Add bid-graph memory instrumentation** (RP5.2) | Paper Theorem 2 bounds memory at ~288 MB. Adding `approxBytes` to `BidGraph.stats()` validates the bound. Does not change the model. |
| **Pin canonical k6 numbers as `paper/figures/k6_results.json`** (RP4.1) | Locks the supplementary Table XII numbers (which match the raw k6 logs) as the source of truth. |

These five items are pure additions/restorations. The submitted paper becomes bit-for-bit reproducible from the code.

### CANNOT do without contradicting the submitted paper

| What | Why we can't (or shouldn't) |
|---|---|
| **Fix the σ sellerId bug in `train.ts` / `eval.ts` (B1)** | The paper's weights in Table VII were trained on the broken pipeline (sellerId = "first truthful agent"). Fixing the bug and retraining shifts the weights. Either the code matches the paper (keep the bug) or it's methodologically clean (lose the weight match). Pick one. |
| **Make σ a real cross-auction signal via multi-auction sim runs (RP3, B2)** | Same conflict. Changing the corpus changes the weights. Paper Table III mean/std for σ (0.87 / 0.33) was computed from the degenerate 1-auction-per-run corpus. |
| **Add a held-out train/test split (D3, B4)** | Paper reports F1=1.000 on the full corpus. A held-out test would report different numbers and contradict Table I. |
| **Fix the straw-man baseline (B5)** | Paper Table I says baseline F1=0.000. Adding a baseline that actually fires changes that row. |
| **Reconcile main-paper Table III with supplementary Table XII (C1)** | Both tables are in the submitted PDF. The discrepancy is locked in. Best we can do is document in `paper/figures/README.md` that supplementary is the canonical source. |
| **Disclose the σ semantics drift in the manuscript** | Cannot edit submitted text. If a revision round happens, this becomes addressable; otherwise it lives as a known issue. |

### The one real tension to decide

**The σ bug.** Three options, pick one:

1. **Preserve the bug** in `train.ts` to keep the paper's weights bit-exact reproducible. Code matches paper. Methodology stays imperfect. Defensible if a reviewer doesn't dig.
2. **Fix the bug, retrain, update `fraud.classifier.ts` to new weights.** Paper text describes a different model than what's in the repo. If a reviewer pulls the repo, they see weights that don't match Table VII.
3. **Fix the bug in a separate `train.v2.ts`, keep the buggy `train.ts` as `train.v1.ts` for paper reproducibility, and commit both classifiers** (`fraud.classifier.ts` = paper snapshot, `fraud.classifier.v2.ts` = corrected). Document the v1→v2 evolution as "post-submission improvement noted for a future revision".

Option 3 is the honest path: paper is reproducible from v1, code carries a v2 marked as a known improvement, and if a revision opportunity opens you have the cleanup pre-staged.

### Recommended execution order (paper-faithful path)

1. RP1.1 + RP1.3 + RP1.4 — pin weights, lock train.ts, preserve runs. **30 minutes of edits.**
2. RP4.1 — canonical k6 JSON. **10 minutes.**
3. RP5.1 + RP5.2 — latency + memory instrumentation. **2-3 hours.**
4. Decide the σ-bug option (1, 2, or 3 above). If option 3, that's another half-day.

After step 3 the submitted paper is fully grounded in code. After step 4 you've also picked your posture on the σ issue. Nothing in steps 1–3 contradicts anything in the paper; nothing requires you to edit the LaTeX.

Want me to start with RP1.1 + RP1.3 + RP1.4 now?