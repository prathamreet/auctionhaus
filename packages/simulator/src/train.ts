/**
 * Logistic-Regression Training Pipeline
 *
 * Loads the labelled corpus via the shared dataset module (which grounds
 * sellerCoOccurrence in the REAL auction owner), fits a binary logistic
 * regression on the TRAIN partition only via batch gradient descent with L2
 * regularisation, and writes the learned weights + z-score parameters into
 * back/src/modules/fraud/fraud.classifier.ts.
 *
 * The held-out TEST partition is never seen here; eval.ts reports on it.
 *
 * Usage (from repo root): npm run train:fraud
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadExamples, splitTrainTest, FEATURE_KEYS } from './dataset';
import type { FeatureVector } from '../../../back/src/modules/fraud/fraud.types';

const ALPHA = 0.2;       // learning rate
const LAMBDA = 0.01;     // L2 regularisation
const EPOCHS = 10000;
const REPORT_THRESHOLD = 0.5; // LR decision boundary for the train-set report
const SHIP_THRESHOLD = 0.5;   // written into the classifier; eval.ts reports the full ROC

const rootDir = process.cwd().endsWith('back') ? path.join(process.cwd(), '..') : process.cwd();
const CLASSIFIER_PATH = path.join(rootDir, 'back', 'src', 'modules', 'fraud', 'fraud.classifier.ts');

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function zeroVec(): FeatureVector {
  return {
    responseTimeMs: 0,
    bidFrequencyPerMin: 0,
    incrementRatio: 0,
    sellerCoOccurrence: 0,
    reciprocityScore: 0,
  };
}

async function train() {
  console.log('[Trainer] Loading corpus (real sellerId grounding)...');
  const all = loadExamples();
  if (all.length === 0) {
    console.error('[Trainer] No examples found. Run `npm run sim:run` a few times first.');
    process.exit(1);
  }
  const { train, test } = splitTrainTest(all);
  console.log(
    `[Trainer] ${all.length} examples total -> ${train.length} train / ${test.length} held-out test`
  );
  const shillTrain = train.filter((e) => e.label === 1).length;
  console.log(`[Trainer] Train labels: ${shillTrain} shill / ${train.length - shillTrain} legit`);

  if (train.length < 10) {
    console.error('[Trainer] Train set too small to fit. Generate more sim runs.');
    process.exit(1);
  }

  // ── 1. Empirical mean / std on TRAIN only (no test leakage) ──
  const mean = zeroVec();
  const std = zeroVec();
  for (const ex of train) for (const k of FEATURE_KEYS) mean[k] += ex.features[k];
  for (const k of FEATURE_KEYS) mean[k] /= train.length;
  for (const ex of train) for (const k of FEATURE_KEYS) std[k] += (ex.features[k] - mean[k]) ** 2;
  for (const k of FEATURE_KEYS) {
    std[k] = Math.sqrt(std[k] / train.length);
    if (std[k] === 0) std[k] = 1; // guard a constant feature
  }

  console.log('\n[Trainer] z-score params (train):');
  console.log('  mean:', mean);
  console.log('  std :', std);

  // ── 2. Normalise (clamp matches the production classifier) ──
  const clamp = (v: number) => Math.max(-4, Math.min(4, v));
  const Z: number[][] = train.map((ex) =>
    FEATURE_KEYS.map((k) => clamp((ex.features[k] - mean[k]) / std[k]))
  );
  const y = train.map((ex) => ex.label);
  const N = train.length;

  // ── 3. Gradient descent ──
  const w = [0, 0, 0, 0, 0];
  let b = 0;
  console.log(`\n[Trainer] Fitting (alpha=${ALPHA}, lambda=${LAMBDA}, epochs=${EPOCHS})...`);
  for (let t = 1; t <= EPOCHS; t++) {
    const pred = Z.map((z) => sigmoid(b + z.reduce((s, v, i) => s + w[i] * v, 0)));
    const dw = [0, 0, 0, 0, 0];
    let db = 0;
    for (let i = 0; i < N; i++) {
      const diff = pred[i] - y[i];
      db += diff;
      for (let j = 0; j < 5; j++) dw[j] += diff * Z[i][j];
    }
    db /= N;
    for (let j = 0; j < 5; j++) dw[j] = dw[j] / N + LAMBDA * w[j];
    b -= ALPHA * db;
    for (let j = 0; j < 5; j++) w[j] -= ALPHA * dw[j];

    if (t === 1 || t % 2000 === 0) {
      let loss = 0;
      for (let i = 0; i < N; i++) {
        loss -= y[i] * Math.log(Math.max(1e-15, pred[i])) + (1 - y[i]) * Math.log(Math.max(1e-15, 1 - pred[i]));
      }
      loss = loss / N + (LAMBDA / 2) * w.reduce((s, v) => s + v * v, 0);
      console.log(`  epoch ${t}/${EPOCHS} | loss ${loss.toFixed(6)}`);
    }
  }

  const weights = {
    intercept: Number(b.toFixed(4)),
    responseTimeMs: Number(w[0].toFixed(4)),
    bidFrequencyPerMin: Number(w[1].toFixed(4)),
    incrementRatio: Number(w[2].toFixed(4)),
    sellerCoOccurrence: Number(w[3].toFixed(4)),
    reciprocityScore: Number(w[4].toFixed(4)),
  };
  console.log('\n[Trainer] Learned weights:', weights);

  // ── 4. Train-set report (at LR boundary) ──
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < N; i++) {
    const p = sigmoid(b + Z[i].reduce((s, v, j) => s + w[j] * v, 0));
    const pred = p >= REPORT_THRESHOLD;
    if (pred && y[i] === 1) tp++;
    else if (pred && y[i] === 0) fp++;
    else if (!pred && y[i] === 0) tn++;
    else fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  console.log('\n[Trainer] Train-set performance (threshold 0.5):');
  console.log(`  Accuracy:  ${(((tp + tn) / N) * 100).toFixed(2)}%`);
  console.log(`  Precision: ${precision.toFixed(4)}`);
  console.log(`  Recall:    ${recall.toFixed(4)}`);
  console.log(`  F1:        ${f1.toFixed(4)}`);

  // ── 5. Write the classifier file ──
  const f4 = (n: number) => n.toFixed(4);
  const content = `// =============================================================================
// Generated by packages/simulator/src/train.ts on ${new Date().toISOString().split('T')[0]}
// =============================================================================
// Logistic-regression classifier for real-time shill-bid scoring.
//
// Fit by batch gradient descent (alpha=${ALPHA}, lambda=${LAMBDA}, epochs=${EPOCHS}) on the
// TRAIN partition of the simulator corpus. sellerCoOccurrence is grounded in
// the real auction owner (see packages/simulator/src/dataset.ts). Held-out
// test metrics and the threshold ROC sweep are reported by eval.ts.
//
// Train-set performance (threshold 0.5):
//   Accuracy ${(((tp + tn) / N) * 100).toFixed(2)}% | Precision ${precision.toFixed(4)} | Recall ${recall.toFixed(4)} | F1 ${f1.toFixed(4)}

import { FeatureVector, ClassifierWeights, NormParams } from './fraud.types';

export const WEIGHTS: ClassifierWeights = {
  intercept: ${weights.intercept},
  responseTimeMs: ${weights.responseTimeMs},
  bidFrequencyPerMin: ${weights.bidFrequencyPerMin},
  incrementRatio: ${weights.incrementRatio},
  reciprocityScore: ${weights.reciprocityScore},
  sellerCoOccurrence: ${weights.sellerCoOccurrence},
};

export const NORM_PARAMS: NormParams = {
  mean: {
    responseTimeMs: ${f4(mean.responseTimeMs)},
    bidFrequencyPerMin: ${f4(mean.bidFrequencyPerMin)},
    incrementRatio: ${f4(mean.incrementRatio)},
    reciprocityScore: ${f4(mean.reciprocityScore)},
    sellerCoOccurrence: ${f4(mean.sellerCoOccurrence)},
  },
  std: {
    responseTimeMs: ${f4(std.responseTimeMs)},
    bidFrequencyPerMin: ${f4(std.bidFrequencyPerMin)},
    incrementRatio: ${f4(std.incrementRatio)},
    reciprocityScore: ${f4(std.reciprocityScore)},
    sellerCoOccurrence: ${f4(std.sellerCoOccurrence)},
  },
};

export const SCORE_THRESHOLD = ${SHIP_THRESHOLD};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function normalise(features: FeatureVector, params: NormParams): FeatureVector {
  const clamp = (v: number, std: number) =>
    std > 0 ? Math.max(-4, Math.min(4, v / std)) : 0;
  return {
    responseTimeMs: clamp(features.responseTimeMs - params.mean.responseTimeMs, params.std.responseTimeMs),
    bidFrequencyPerMin: clamp(features.bidFrequencyPerMin - params.mean.bidFrequencyPerMin, params.std.bidFrequencyPerMin),
    incrementRatio: clamp(features.incrementRatio - params.mean.incrementRatio, params.std.incrementRatio),
    reciprocityScore: clamp(features.reciprocityScore - params.mean.reciprocityScore, params.std.reciprocityScore),
    sellerCoOccurrence: clamp(features.sellerCoOccurrence - params.mean.sellerCoOccurrence, params.std.sellerCoOccurrence),
  };
}

/** Score a feature vector. Returns a probability in [0, 1]. */
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

/** Human-readable explanation of the contributing features for a flag. */
export function explain(features: FeatureVector, s: number): string {
  const parts: string[] = [];
  if (features.responseTimeMs < 500 && features.responseTimeMs > 0) {
    parts.push(\`response time \${features.responseTimeMs}ms (bot-speed)\`);
  }
  if (features.bidFrequencyPerMin > 2) {
    parts.push(\`\${features.bidFrequencyPerMin.toFixed(1)} bids/min (high frequency)\`);
  }
  if (features.incrementRatio < 1.5 && features.incrementRatio > 0) {
    parts.push(\`increment x\${features.incrementRatio.toFixed(2)} (minimum-increment scripting)\`);
  }
  if (features.sellerCoOccurrence >= 3) {
    parts.push(\`\${features.sellerCoOccurrence} auctions with same seller (co-occurrence)\`);
  }
  if (features.reciprocityScore > 0.3) {
    parts.push(\`reciprocity \${(features.reciprocityScore * 100).toFixed(0)}% (collusion ring)\`);
  }
  if (parts.length === 0) parts.push(\`composite score \${s.toFixed(3)}\`);
  return parts.join('; ');
}
`;

  fs.writeFileSync(CLASSIFIER_PATH, content);
  console.log(`\n[Trainer] Wrote ${CLASSIFIER_PATH}`);
  console.log('[Trainer] Next: npm run eval:fraud  (reports held-out test metrics + ROC + ablation)');
}

train().catch((e) => {
  console.error('[Trainer] Failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
