// =============================================================================
// PAPER_SNAPSHOT: 2026-06-01
// =============================================================================
// These constants are the model published in:
//   "Real-Time Shill-Bidding Detection via Online Bid-Graph Analytics in Live
//    Auction Platforms" (IEEE submission, 2026-06-01).
//
// Source corpus: 3 simulator runs, 70 training examples (59 shill / 11 truthful).
// Producing runs preserved under:
//   back/packages/simulator/runs/_paper-snapshot/
//
// Producing trainer: packages/simulator/src/train.ts
//   Re-run with --write --confirm to regenerate this file from the preserved
//   runs. Default invocation writes to fraud.classifier.candidate.ts so the
//   snapshot cannot be overwritten by accident.
//
// DO NOT mutate the constants below without simultaneously regenerating the
// paper figures. The supplementary's "complete source code" section (sec. 3.4)
// reproduces these values verbatim; any drift breaks paper reproducibility.
//
// A corrected trainer (train.v2.ts) addresses the post-submission sellerId
// methodology issue and writes to a separate candidate file. It is documented
// as a future-revision improvement and never modifies this snapshot.
// =============================================================================
//
// Logistic-regression classifier for real-time shill-bid scoring.
//
// Model architecture: a single-layer logistic regression over 5 normalised
// features. Weights are trained offline on the synthetic simulator logs
// (packages/simulator) and stored here as constants — no runtime training,
// no Python sidecar, no external dependencies.
//
// TRAINING METRICS (paper snapshot, from train.ts on 3 preserved runs):
//   - Accuracy:  97.14%
//   - Precision: 0.9672
//   - Recall:    1.0000
//   - F1-Score:  0.9833

import { FeatureVector, ClassifierWeights, NormParams } from './fraud.types';

/**
 * Logistic-regression weights (log-odds scale, pre-normalisation).
 * Positive = increases fraud score; negative = decreases it.
 *
 * Derived via batch gradient descent with L2 regularisation
 * (alpha=0.20, lambda=0.01, epochs=10000) on the paper-snapshot corpus.
 */
export const WEIGHTS: ClassifierWeights = {
  intercept: 2.7426,
  responseTimeMs: 0.0095,
  bidFrequencyPerMin: 1.4572,
  incrementRatio: -0.9484,
  reciprocityScore: -0.4409,
  sellerCoOccurrence: 1.7342,
};

/**
 * Normalisation parameters derived empirically from the paper-snapshot corpus.
 * Features are z-scored: z = (x - mean) / std.
 */
export const NORM_PARAMS: NormParams = {
  mean: {
    responseTimeMs: 2399.84,
    bidFrequencyPerMin: 0.1186,
    incrementRatio: 1.3857,
    reciprocityScore: 0.2924,
    sellerCoOccurrence: 0.8714,
  },
  std: {
    responseTimeMs: 1389.50,
    bidFrequencyPerMin: 0.0678,
    incrementRatio: 0.8991,
    reciprocityScore: 0.1785,
    sellerCoOccurrence: 0.3347,
  },
};

export const SCORE_THRESHOLD = 0.20;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function normalise(features: FeatureVector, params: NormParams): FeatureVector {
  const clamp = (v: number, std: number) =>
    std > 0 ? Math.max(-4, Math.min(4, v / std)) : 0;

  return {
    responseTimeMs: clamp(
      features.responseTimeMs - params.mean.responseTimeMs,
      params.std.responseTimeMs
    ),
    bidFrequencyPerMin: clamp(
      features.bidFrequencyPerMin - params.mean.bidFrequencyPerMin,
      params.std.bidFrequencyPerMin
    ),
    incrementRatio: clamp(
      features.incrementRatio - params.mean.incrementRatio,
      params.std.incrementRatio
    ),
    reciprocityScore: clamp(
      features.reciprocityScore - params.mean.reciprocityScore,
      params.std.reciprocityScore
    ),
    sellerCoOccurrence: clamp(
      features.sellerCoOccurrence - params.mean.sellerCoOccurrence,
      params.std.sellerCoOccurrence
    ),
  };
}

/**
 * Score a feature vector. Returns a probability in [0, 1].
 * Values above SCORE_THRESHOLD trigger a fraud:flag event.
 */
export function score(features: FeatureVector): number {
  const z = normalise(features, NORM_PARAMS);
  const logit =
    WEIGHTS.intercept +
    WEIGHTS.responseTimeMs * z.responseTimeMs +
    WEIGHTS.bidFrequencyPerMin * z.bidFrequencyPerMin +
    WEIGHTS.incrementRatio * z.incrementRatio +
    WEIGHTS.reciprocityScore * z.reciprocityScore +
    WEIGHTS.sellerCoOccurrence * z.sellerCoOccurrence;
  return sigmoid(logit);
}

/**
 * Human-readable explanation of the top contributing features for a flag.
 * Used in the fraud:flag event `reason` field.
 */
export function explain(features: FeatureVector, s: number): string {
  const parts: string[] = [];

  if (features.responseTimeMs < 500 && features.responseTimeMs > 0) {
    parts.push(`response time ${features.responseTimeMs}ms (bot-speed)`);
  }
  if (features.bidFrequencyPerMin > 2) {
    parts.push(`${features.bidFrequencyPerMin.toFixed(1)} bids/min (high frequency)`);
  }
  if (features.incrementRatio < 1.5 && features.incrementRatio > 0) {
    parts.push(`increment x${features.incrementRatio.toFixed(2)} (minimum-increment scripting)`);
  }
  if (features.sellerCoOccurrence >= 3) {
    parts.push(`${features.sellerCoOccurrence} auctions with same seller (co-occurrence)`);
  }
  if (features.reciprocityScore > 0.3) {
    parts.push(`reciprocity ${(features.reciprocityScore * 100).toFixed(0)}% (collusion ring)`);
  }

  if (parts.length === 0) parts.push(`composite score ${s.toFixed(3)}`);
  return parts.join('; ');
}
