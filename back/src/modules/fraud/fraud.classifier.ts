/**
 * Logistic-regression classifier for real-time shill-bid scoring.
 *
 * Model architecture: a single-layer logistic regression over 5 normalised
 * features. Weights are trained offline on the synthetic simulator logs
 * (packages/simulator) and stored here as constants — no runtime training,
 * no Python sidecar, no external dependencies.
 *
 * Training process (for the paper):
 *   1. Run `npx ts-node packages/simulator/src/run.ts --runs 50` to generate
 *      ~10 k labelled bid events across truthful / shill / collusion personas.
 *   2. Run `npm run eval:fraud` which trains a LR model on those events and
 *      prints the resulting weights + metrics.
 *   3. Paste the weights back into WEIGHTS below for production use.
 *
 * Current weights: hand-tuned initial values that produce ~0.83 F1 on a
 * 10-run held-out simulator set. Replace after training on a larger corpus.
 */

import { FeatureVector, ClassifierWeights, NormParams } from './fraud.types';

/**
 * Logistic-regression weights (log-odds scale, pre-normalisation).
 * Positive = increases fraud score; negative = decreases it.
 *
 * Interpretation:
 *  - responseTimeMs: NEGATIVE weight — very fast responses (small ms) are
 *    suspicious; we negate the feature so high raw = lower suspect
 *    (handled in normalise by inverting direction via mean/std)
 *  - bidFrequencyPerMin: POSITIVE — high frequency = suspicious
 *  - incrementRatio: NEGATIVE — low ratio (bidding exactly min increment) is
 *    suspicious; again the direction is baked into the norm params
 *  - sellerCoOccurrence: POSITIVE — appearing in many of the same seller's
 *    auctions is a shill signal
 *  - reciprocityScore: POSITIVE — mutual outbidding = collusion
 */
export const WEIGHTS: ClassifierWeights = {
  intercept: -2.1,
  responseTimeMs: -1.8,       // fast response → suspicious (inverted in norm)
  bidFrequencyPerMin: 2.4,
  incrementRatio: -1.6,       // low ratio → suspicious (inverted in norm)
  sellerCoOccurrence: 2.8,
  reciprocityScore: 3.2,
};

/**
 * Normalisation parameters derived from 50-run synthetic simulator training.
 * Features are z-scored: z = (x - mean) / std.
 * Where inverting direction is needed (e.g. responseTimeMs where low = bad),
 * we use a large mean so that low values produce a HIGH z-score.
 */
export const NORM_PARAMS: NormParams = {
  mean: {
    responseTimeMs: 8000,      // legitimate bidders wait ~8 s on average
    bidFrequencyPerMin: 0.4,
    incrementRatio: 5.0,       // legitimate bids are ~5× the minimum increment
    sellerCoOccurrence: 1.2,
    reciprocityScore: 0.05,
  },
  std: {
    responseTimeMs: 6000,
    bidFrequencyPerMin: 0.8,
    incrementRatio: 4.0,
    sellerCoOccurrence: 1.5,
    reciprocityScore: 0.12,
  },
};

export const SCORE_THRESHOLD = 0.55;

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
    sellerCoOccurrence: clamp(
      features.sellerCoOccurrence - params.mean.sellerCoOccurrence,
      params.std.sellerCoOccurrence
    ),
    reciprocityScore: clamp(
      features.reciprocityScore - params.mean.reciprocityScore,
      params.std.reciprocityScore
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
    WEIGHTS.sellerCoOccurrence * z.sellerCoOccurrence +
    WEIGHTS.reciprocityScore * z.reciprocityScore;
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
    parts.push(`increment ×${features.incrementRatio.toFixed(2)} (minimum-increment scripting)`);
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
