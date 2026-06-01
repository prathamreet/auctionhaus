/**
 * Phase C - Genuine Logistic Regression Training Pipeline
 *
 * This script processes the historical simulation runs in `packages/simulator/runs/`,
 * extracts their streaming features using the exact `BidGraph` and `extractFeatures`
 * pipeline, computes the empirical mean and standard deviation (z-score normalisation parameters),
 * and fits a true binary logistic regression classifier using Gradient Descent with L2 regularisation.
 *
 * It then updates `back/src/modules/fraud/fraud.classifier.ts` with the mathematically learned
 * z-score parameters and weight coefficients.
 *
 * Usage:
 *   npx ts-node packages/simulator/src/train.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BidLogEntry, SimRunManifest } from './types';
import { extractFeatures } from '../../../back/src/modules/fraud/fraud.features';
import { BidGraph } from '../../../back/src/modules/fraud/fraud.graph';
import type { BidEvent, FeatureVector } from '../../../back/src/modules/fraud/fraud.types';

const RUNS_DIR = path.join(process.cwd(), 'packages', 'simulator', 'runs');
const rootDir = process.cwd().endsWith('back') ? path.join(process.cwd(), '..') : process.cwd();
const CLASSIFIER_PATH = path.join(rootDir, 'back', 'src', 'modules', 'fraud', 'fraud.classifier.ts');

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

async function train() {
  console.log('[Trainer] Starting genuine logistic regression training pipeline...');

  if (!fs.existsSync(RUNS_DIR)) {
    console.error(`[Trainer] Runs directory not found at ${RUNS_DIR}. Please run a simulation first: npm run sim:run`);
    process.exit(1);
  }

  const runDirs = fs.readdirSync(RUNS_DIR).filter((name) => {
    const p = path.join(RUNS_DIR, name);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'events.jsonl'));
  });

  if (runDirs.length === 0) {
    console.error(`[Trainer] No simulation runs found in ${RUNS_DIR}. Please run a simulation first: npm run sim:run`);
    process.exit(1);
  }

  console.log(`[Trainer] Found ${runDirs.length} simulation run directories. Extracting features...`);

  const featuresList: FeatureVector[] = [];
  const labels: number[] = []; // 1 for shill, 0 for truthful

  for (const dirName of runDirs) {
    const runDir = path.join(RUNS_DIR, dirName);
    const eventsPath = path.join(runDir, 'events.jsonl');
    const manifestPath = path.join(runDir, 'manifest.json');

    const manifest: SimRunManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean);
    const events: BidLogEntry[] = lines.map((l) => JSON.parse(l));

    const graph = new BidGraph();
    const sellerId = Object.entries(manifest.agentMap).find(
      ([, v]) => v.agentType === 'truthful'
    )?.[0] ?? 'unknown';

    for (const e of events) {
      const event: BidEvent = {
        bidId: `train-${e.ts}-${e.bidderId}`,
        auctionId: e.auctionId,
        bidderId: e.bidderId,
        bidderName: manifest.agentMap[e.bidderId]?.agentType ?? 'unknown',
        sellerId,
        auctionTitle: 'Training Auction',
        amount: e.amount,
        minIncrement: manifest.config.minIncrement,
        ts: e.ts,
        isAutoBid: false,
      };

      graph.add(event);
      const features = extractFeatures(event, graph);
      featuresList.push(features);
      labels.push(e.isShill ? 1 : 0);
    }
  }

  const N = featuresList.length;
  if (N === 0) {
    console.error('[Trainer] No bid events found to train on.');
    process.exit(1);
  }

  console.log(`[Trainer] Extracted ${N} training examples (${labels.filter((l) => l === 1).length} shill / ${labels.filter((l) => l === 0).length} truthful).`);

  // ── 1. Calculate Empirical Mean and Standard Deviation (z-score parameters) ──
  const keys: Array<keyof FeatureVector> = [
    'responseTimeMs',
    'bidFrequencyPerMin',
    'incrementRatio',
    'sellerCoOccurrence',
    'reciprocityScore',
  ];

  const mean: FeatureVector = {
    responseTimeMs: 0,
    bidFrequencyPerMin: 0,
    incrementRatio: 0,
    sellerCoOccurrence: 0,
    reciprocityScore: 0,
  };

  const std: FeatureVector = {
    responseTimeMs: 0,
    bidFrequencyPerMin: 0,
    incrementRatio: 0,
    sellerCoOccurrence: 0,
    reciprocityScore: 0,
  };

  // Compute Mean
  for (const f of featuresList) {
    for (const k of keys) {
      mean[k] += f[k];
    }
  }
  for (const k of keys) {
    mean[k] /= N;
  }

  // Compute Variance & Std
  for (const f of featuresList) {
    for (const k of keys) {
      std[k] += Math.pow(f[k] - mean[k], 2);
    }
  }
  for (const k of keys) {
    std[k] = Math.sqrt(std[k] / N);
    if (std[k] === 0) std[k] = 1.0; // Avoid division by zero
  }

  console.log('\n[Trainer] Derived Z-Score Parameters (Empirical NORM_PARAMS):');
  console.log('Mean:', mean);
  console.log('Std: ', std);

  // ── 2. Normalise (z-score) Features ──
  const Z: number[][] = [];
  for (let i = 0; i < N; i++) {
    const f = featuresList[i];
    const zRow = keys.map((k) => (f[k] - mean[k]) / std[k]);
    Z.push(zRow);
  }

  // ── 3. Train Logistic Regression model using Gradient Descent ──
  let w = [0, 0, 0, 0, 0]; // Weights for keys in order
  let b = 0;              // Intercept
  const alpha = 0.2;      // Learning rate
  const lambda = 0.01;    // L2 regularisation penalty
  const epochs = 10000;

  console.log(`\n[Trainer] Training model via Gradient Descent (epochs=${epochs}, alpha=${alpha}, lambda=${lambda})...`);

  for (let t = 1; t <= epochs; t++) {
    const predictions: number[] = [];
    for (let i = 0; i < N; i++) {
      const z = Z[i];
      const logit = b + z.reduce((sum, val, idx) => sum + w[idx] * val, 0);
      predictions.push(sigmoid(logit));
    }

    // Gradients
    const dw = [0, 0, 0, 0, 0];
    let db = 0;

    for (let i = 0; i < N; i++) {
      const diff = predictions[i] - labels[i];
      db += diff;
      for (let j = 0; j < 5; j++) {
        dw[j] += diff * Z[i][j];
      }
    }

    db /= N;
    for (let j = 0; j < 5; j++) {
      dw[j] = dw[j] / N + lambda * w[j];
    }

    // Gradient descent step
    b -= alpha * db;
    for (let j = 0; j < 5; j++) {
      w[j] -= alpha * dw[j];
    }

    // Log progress every 2000 epochs
    if (t === 1 || t % 2000 === 0) {
      let loss = 0;
      for (let i = 0; i < N; i++) {
        const p = predictions[i];
        const y = labels[i];
        loss -= y * Math.log(Math.max(1e-15, p)) + (1 - y) * Math.log(Math.max(1e-15, 1 - p));
      }
      loss = loss / N + (lambda / 2) * w.reduce((sum, val) => sum + val * val, 0);
      console.log(`  Epoch ${t}/${epochs} | Loss: ${loss.toFixed(6)}`);
    }
  }

  // Learned weights mapped to feature names
  const learnedWeights = {
    intercept: Number(b.toFixed(4)),
    responseTimeMs: Number(w[0].toFixed(4)),
    bidFrequencyPerMin: Number(w[1].toFixed(4)),
    incrementRatio: Number(w[2].toFixed(4)),
    sellerCoOccurrence: Number(w[3].toFixed(4)),
    reciprocityScore: Number(w[4].toFixed(4)),
  };

  console.log('\n[Trainer] Learned Model Weights (Mathematically Optimized):');
  console.log(learnedWeights);

  // ── 4. Evaluate Model Metrics on Training Set ──
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < N; i++) {
    const z = Z[i];
    const logit = b + z.reduce((sum, val, idx) => sum + w[idx] * val, 0);
    const p = sigmoid(logit);
    const pred = p >= 0.55; // Using the active SCORE_THRESHOLD
    const y = labels[i];

    if (pred && y === 1) tp++;
    else if (pred && y === 0) fp++;
    else if (!pred && y === 0) tn++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  console.log('\n[Trainer] Training Performance:');
  console.log(`  Accuracy:  ${((tp + tn) / N * 100).toFixed(2)}%`);
  console.log(`  Precision: ${precision.toFixed(4)}`);
  console.log(`  Recall:    ${recall.toFixed(4)}`);
  console.log(`  F1-Score:  ${f1.toFixed(4)}`);

  // ── 5. Overwrite the Classifier File programmatically ──
  console.log(`\n[Trainer] Updating ${CLASSIFIER_PATH}...`);
  if (!fs.existsSync(CLASSIFIER_PATH)) {
    console.error(`[Trainer] Error: fraud.classifier.ts not found at ${CLASSIFIER_PATH}`);
    process.exit(1);
  }

  const newContent = `/**
 * Logistic-regression classifier for real-time shill-bid scoring.
 *
 * Model architecture: a single-layer logistic regression over 5 normalised
 * features. Weights are trained offline on the synthetic simulator logs
 * (packages/simulator) and stored here as constants — no runtime training,
 * no Python sidecar, no external dependencies.
 *
 * TRAINING METRICS (Mathematically learned on simulator runs):
 *  - Accuracy:  ${((tp + tn) / N * 100).toFixed(2)}%
 *  - Precision: ${precision.toFixed(4)}
 *  - Recall:    ${recall.toFixed(4)}
 *  - F1-Score:  ${f1.toFixed(4)}
 *
 * Generated by packages/simulator/src/train.ts on ${new Date().toISOString().split('T')[0]}
 */

import { FeatureVector, ClassifierWeights, NormParams } from './fraud.types';

/**
 * Logistic-regression weights (log-odds scale, pre-normalisation).
 * Positive = increases fraud score; negative = decreases it.
 *
 * Derived via empirical gradient descent optimisation.
 */
export const WEIGHTS: ClassifierWeights = {
  intercept: ${learnedWeights.intercept},
  responseTimeMs: ${learnedWeights.responseTimeMs},
  bidFrequencyPerMin: ${learnedWeights.bidFrequencyPerMin},
  incrementRatio: ${learnedWeights.incrementRatio},
  reciprocityScore: ${learnedWeights.reciprocityScore},
  sellerCoOccurrence: ${learnedWeights.sellerCoOccurrence},
};

/**
 * Normalisation parameters derived from empirical training.
 * Features are z-scored: z = (x - mean) / std.
 */
export const NORM_PARAMS: NormParams = {
  mean: {
    responseTimeMs: ${mean.responseTimeMs.toFixed(4)},
    bidFrequencyPerMin: ${mean.bidFrequencyPerMin.toFixed(4)},
    incrementRatio: ${mean.incrementRatio.toFixed(4)},
    reciprocityScore: ${mean.reciprocityScore.toFixed(4)},
    sellerCoOccurrence: ${mean.sellerCoOccurrence.toFixed(4)},
  },
  std: {
    responseTimeMs: ${std.responseTimeMs.toFixed(4)},
    bidFrequencyPerMin: ${std.bidFrequencyPerMin.toFixed(4)},
    incrementRatio: ${std.incrementRatio.toFixed(4)},
    reciprocityScore: ${std.reciprocityScore.toFixed(4)},
    sellerCoOccurrence: ${std.sellerCoOccurrence.toFixed(4)},
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
 * Used in the fraud:flag event \`reason\` field.
 */
export function explain(features: FeatureVector, s: number): string {
  const parts: string[] = [];

  if (features.responseTimeMs < 500 && features.responseTimeMs > 0) {
    parts.push(\`response time \${features.responseTimeMs}ms (bot-speed)\`);
  }
  if (features.bidFrequencyPerMin > 2) {
    parts.push(\`\${features.bidFrequencyPerMin.toFixed(1)} bids/min (high frequency)\`);
  }
  if (features.incrementRatio < 1.5 && features.incrementRatio > 0) {
    parts.push(\`increment ×\${features.incrementRatio.toFixed(2)} (minimum-increment scripting)\`);
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

  fs.writeFileSync(CLASSIFIER_PATH, newContent);
  console.log('[Trainer] Successfully wrote updated weights and normalisation params.');
}

train().catch(console.error);
