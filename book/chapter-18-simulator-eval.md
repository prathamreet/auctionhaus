# Chapter 12 — The Simulator and Evaluation Pipeline

## The Problem with Real Data

The ideal way to evaluate a fraud detection system is to test it on real labelled data — a set of bids where we know, for each one, whether it was shill bidding or not. Companies like eBay have this data. Academic researchers have used eBay auction dumps from the early 2000s. But:

1. eBay data is proprietary. We cannot access it.
2. Even if we could, using it for a student project raises ToS issues.
3. Most historical datasets are old and reflect bidding patterns from before modern automation tools.

The standard alternative in intrusion detection and fraud detection literature is a **synthetic dataset**: generate labelled data from a configurable simulator, train on part of it, evaluate on the held-out part.

The criticism of synthetic data is that it might be unrealistically clean — the classifier learns to identify the simulator's patterns, not real fraud. This is a genuine limitation (we discuss it in the paper's threats-to-validity section). But it is also the standard approach for systems where real labelled data is unavailable.

---

## The Simulator Package

`packages/simulator/` is a standalone TypeScript package. It:

1. Creates real auction(s) via the live API
2. Creates real user accounts for each agent
3. Drives those agents against the auction in real time (polling loop)
4. Records every bid event with a ground-truth `isShill` label
5. Writes `events.jsonl` (one JSON line per bid event) and `manifest.json` (run metadata)

The simulator is run from the back workspace:

```bash
npm run sim:run    # from back/ — creates auctions, runs for 60s
```

Each run produces a directory under `back/packages/simulator/runs/<uuid>/`.

---

## The Multi-Auction Setup (Phase RP-2)

The original simulator (Phase C1) ran a single auction. This was a problem for the seller co-occurrence feature: σ measures how many auctions from the **same seller** a bidder appears in. With only one auction, every bidder has σ = 1 by definition. The feature is useless — no variance.

The Phase RP-2 rewrite creates:
- **3 primary auctions** listed by the primary seller (default, configurable via `SIM_PRIMARY_AUCTIONS`)
- **1 decoy auction** listed by a second seller

Shill and collusion agents span ALL primary auctions (high σ — they target the same seller everywhere). Truthful and sniper agents take ONE primary auction each, and truthful agents may also bid the decoy auction (low σ — they are genuinely shopping, not targeting one seller).

This creates real variance in the σ feature. Shill agents have σ = 3 (they appeared in 3 primary auctions from the same seller). Truthful agents have σ = 1 or 2.

The `manifest.auctionOwners` field records the seller ID for each auction, so the training pipeline can ground the co-occurrence calculation in the real seller.

---

## The Four Agent Personas

### TruthfulAgent

A genuine bidder with a private valuation (how much they are actually willing to pay). They:
- Have a random bid timing (uniform distribution over the auction duration)
- Bid at varying increments above the minimum (not scripted)
- Stop bidding when the price exceeds their valuation
- May bid on one primary auction and the decoy (plausible shopping behaviour)

The TruthfulAgent produces `isShill: false` labels.

### SniperAgent

A strategy-following but legitimate bidder. They:
- Wait until the last 15% of the auction duration
- Place one bid slightly above the current price
- The timing is legitimate; they are using a real strategy (sniping — bidding at the last moment to prevent counter-bids)

The SniperAgent produces `isShill: false` labels. Importantly, the fraud classifier should NOT flag snipers — they have a legitimate (if aggressive) bidding strategy.

### ShillAgent

A bot working for the seller. They:
- Respond very quickly to other bids (under 800ms response time)
- Always bid the minimum increment
- Stop bidding when the price approaches the reserve price (they never actually win and pay)
- Bid across all primary auctions (same seller) — high σ

The ShillAgent produces `isShill: true` labels.

### CollusionAgent

Part of a ring of fake bidders. The ring has two agents who:
- Mutually outbid each other across multiple auctions
- Their mutual outbidding creates the reciprocity pattern (γ close to 1.0)
- Both bid across all primary auctions (same seller) — high σ

CollusionAgents produce `isShill: true` labels.

---

## The Dataset Module

`packages/simulator/src/dataset.ts` is the shared data loading module (added in Phase RP-2).

**Why shared?** Before Phase RP-2, the train and eval scripts each had their own data loading code. They could easily drift — one might apply different filtering, different label logic. Using a single `dataset.ts` ensures both use identical data.

### Train/Test Split

The split uses a deterministic hash function (FNV-1a) on each bid's ID:

```typescript
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

function isInTrainSet(bidId: string, trainFraction = 0.75): boolean {
  return (fnv1a(bidId) % 100) < (trainFraction * 100);
}
```

A 75/25 train/test split based on the bid ID. The hash is deterministic — the same bid ID always goes to the same partition. This prevents data leakage: if you run the simulator multiple times and concatenate results, bids do not randomly shuffle between train and test.

**Why deterministic hash instead of random?** If you used `Math.random()`, rerunning the pipeline would produce different train/test splits. Evaluating on a different test set each time makes results incomparable. The hash ensures the same bid always lands in the same partition, making experiments reproducible.

---

## The Training Pipeline

`packages/simulator/src/train.ts`

**Input:** Events from all non-archived run directories under `runs/`

**Steps:**

1. Load the `events.jsonl` and `manifest.json` from each run directory (skipping `_`-prefixed archives)
2. Feed each bid event through the same `BidGraph` + `extractFeatures` pipeline the production classifier uses — this simulates what the production system would have "seen" at the time of each bid
3. Split examples into train (75%) and test (25%) using FNV-1a hash
4. On the TRAIN partition only:
   - Compute per-feature mean and std (normalization parameters)
   - Run batch gradient descent (10000 epochs, learning rate 0.2, L2 regularization λ=0.01) to minimize binary cross-entropy
5. Write the learned weights and normalization parameters to `fraud.classifier.ts`

**Train-set performance (threshold 0.5):**
```
Accuracy: 93.18%
Precision: 0.9459
Recall: 0.9722
F1: 0.9589
```

**Important:** The normalization params are computed ONLY on the train partition. Computing them on the full dataset (including test) would be test data leakage — the classifier would have had access to statistics from the test examples during training.

---

## The Evaluation Pipeline

`packages/simulator/src/eval.ts`

**Input:** Same events, HELD-OUT TEST partition only

**Steps:**

1. Load examples (test partition only)
2. Score each example with the trained classifier
3. Sweep thresholds from 0.05 to 0.95
4. At each threshold: compute precision, recall, F1
5. Build the ROC curve (TPR vs FPR at each threshold)
6. Run mean-ablation: for each feature, set it to its mean (z-score = 0) and re-score all examples. Compare F1 with and without the feature.
7. Score two baselines:
   - **Outbid-count > 10 heuristic**: the naive detector from the original code
   - **Best single-feature decision stump**: fit a threshold on the single best feature, compare to the full classifier

**Output files:**
- `paper/figures/roc_data.json` — ROC curve data points
- `paper/figures/ablation_data.json` — per-feature ablation F1 scores
- `paper/tables/metrics.tex` — the LaTeX table that goes directly into the paper

---

## The Ablation Results

From `paper/figures/ablation_data.json` (on the held-out test set):

| Feature Removed | F1 | Precision | Recall |
|-----------------|-----|-----------|--------|
| None (full model) | 0.933 | 1.000 | 0.875 |
| responseTimeMs | 0.933 | 1.000 | 0.875 |
| bidFrequencyPerMin | 0.933 | 1.000 | 0.875 |
| incrementRatio | 0.933 | 1.000 | 0.875 |
| **sellerCoOccurrence** | **0.842** | **0.727** | **1.000** |
| reciprocityScore | 0.933 | 1.000 | 0.875 |

Removing `sellerCoOccurrence` (σ) drops precision from 1.000 to 0.727. This is the empirical confirmation of what the model structure already suggests: σ is the dominant feature. Shill and collusion agents both have high σ (they target multiple auctions by the same seller). Truthful and sniper agents have low σ.

The paper's abstract reported F1 = 1.000 at threshold 0.20 on the training-era corpus. The test-set numbers above are the honest re-evaluation after the Phase RP-2 pipeline fix. The F1 dropped from 1.000 to 0.933 on the test set — still strong, and now a credible number from a held-out evaluation.

---

## Threats to Validity

The paper discusses three:

**Internal validity:** The classifier achieves good results because the synthetic agents have distinctive patterns. In the real world, fraud is more varied and adaptive. A real shill bidder who knows about σ-based detection would use more sellers. The classifier would need retraining.

**External validity:** All benchmarks were run on one machine. Distributed deployments would have different absolute latency numbers.

**Construct validity:** F1 at a fixed threshold is sensitive to class imbalance. In production, where shill bids might be 1% of all bids, the precision-recall curve (not F1) is the meaningful metric. The ROC curve in the paper shows the classifier maintains high TPR across a wide range of thresholds.

---

## The Honest Pipeline Rebuild (Phase RP-2)

After the paper's first submission, it was rejected on domain scope (not technical merit — the venue was outside our scope). With the paper no longer frozen, we implemented the corrections that had been deferred:

1. The single-auction simulator → multi-auction simulator (real variance in σ)
2. The shared dataset module (no train/eval drift)
3. Train on train-only (no test leakage in normalization params)
4. Eval reports test numbers (not training numbers)
5. Two real baselines (outbid-count + best decision stump)

The old corpus from the first submission is preserved under `runs/_paper-snapshot/` for provenance. The new pipeline produces different (honest) numbers. The paper was updated with the new numbers before the resubmission.

---

## Next Chapter

Chapter 13 explains the cryptographic commit-reveal protocol for sealed-bid auctions — how SHA-256 commitments work, why they provide hiding and binding, and what the limitations are.
