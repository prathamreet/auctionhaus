// =============================================================================
// PAPER-FAITHFUL TRAINER
// =============================================================================
// This is the trainer that produced the model published in:
//   "Real-Time Shill-Bidding Detection via Online Bid-Graph Analytics in Live
//    Auction Platforms" (IEEE submission, 2026-06-01).
//
// The path packages/simulator/src/train.ts is referenced in
// paper/supplementary.tex section 4.1 -- keep this filename stable.
// Internal logs use a "v1" label to distinguish from the post-submission
// corrected pipeline at train.v2.ts.
//
// It carries one known methodological imperfection: the sellerId used for the
// sellerCoOccurrence feature is picked from the manifest's first truthful
// agent. This matches the corpus on which the paper's weights were trained,
// so re-running this script against the preserved `_paper-snapshot/` runs
// reproduces the paper's exact constants.
//
// Do not "fix" the sellerId resolution in this file. The corrected pipeline
// lives in train.v2.ts, which writes to a separate candidate file and is
// documented as a post-submission improvement.
//
// SAFETY: by default this script writes to fraud.classifier.candidate.ts so
// the paper snapshot in fraud.classifier.ts cannot be overwritten by accident.
// Pass --write --confirm to overwrite the live snapshot (only do this when
// regenerating the paper figures from the preserved runs).
//
// Usage:
//   npx ts-node packages/simulator/src/train.ts                     # safe: writes candidate
//   npx ts-node packages/simulator/src/train.ts --write             # errors without --confirm
//   npx ts-node packages/simulator/src/train.ts --write --confirm   # overwrites live snapshot
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type { BidLogEntry, SimRunManifest } from './types';
import { extractFeatures } from '../../../back/src/modules/fraud/fraud.features';
import { BidGraph } from '../../../back/src/modules/fraud/fraud.graph';
import type { BidEvent, FeatureVector } from '../../../back/src/modules/fraud/fraud.types';

// ── CLI flags ────────────────────────────────────────────────────────────────
const cliArgs = new Set(process.argv.slice(2));
const WRITE = cliArgs.has('--write');
const CONFIRM = cliArgs.has('--confirm');

if (WRITE && !CONFIRM) {
  console.error(
    '[Trainer v1] --write was passed without --confirm. Refusing to overwrite paper snapshot.'
  );
  console.error('[Trainer v1] To overwrite back/src/modules/fraud/fraud.classifier.ts:');
  console.error('[Trainer v1]   npx ts-node packages/simulator/src/train.ts --write --confirm');
  console.error(
    '[Trainer v1] Without flags, training output goes to fraud.classifier.candidate.ts.'
  );
  process.exit(1);
}

// ── Paths ────────────────────────────────────────────────────────────────────
// Reads runs from _paper-snapshot/ when present so the paper-faithful training
// corpus is the implicit source of truth. Falls back to the top-level runs/
// folder if the snapshot directory does not exist.
const rootDir = process.cwd().endsWith('back') ? path.join(process.cwd(), '..') : process.cwd();
const SNAPSHOT_RUNS_DIR = path.join(
  rootDir,
  'back',
  'packages',
  'simulator',
  'runs',
  '_paper-snapshot'
);
const FALLBACK_RUNS_DIR = path.join(rootDir, 'back', 'packages', 'simulator', 'runs');
const RUNS_DIR = fs.existsSync(SNAPSHOT_RUNS_DIR) ? SNAPSHOT_RUNS_DIR : FALLBACK_RUNS_DIR;

const CLASSIFIER_LIVE_PATH = path.join(
  rootDir,
  'back',
  'src',
  'modules',
  'fraud',
  'fraud.classifier.ts'
);
const CLASSIFIER_CANDIDATE_PATH = path.join(
  rootDir,
  'back',
  'src',
  'modules',
  'fraud',
  'fraud.classifier.candidate.ts'
);
const CLASSIFIER_PATH = WRITE && CONFIRM ? CLASSIFIER_LIVE_PATH : CLASSIFIER_CANDIDATE_PATH;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

async function train() {
  console.log('[Trainer v1] Paper-faithful logistic regression training pipeline');
  console.log(`[Trainer v1] Reading runs from: ${RUNS_DIR}`);
  console.log(
    `[Trainer v1] Output target: ${CLASSIFIER_PATH}` +
      (WRITE && CONFIRM ? '  (LIVE SNAPSHOT)' : '  (candidate file)')
  );

  if (!fs.existsSync(RUNS_DIR)) {
    console.error(`[Trainer v1] Runs directory not found at ${RUNS_DIR}. Please run a simulation first: npm run sim:run`);
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

  console.log('\n[Trainer v1] Learned Model Weights (Mathematically Optimized):');
  console.log(learnedWeights);

  // ── 4. Evaluate Model Metrics on Training Set ──
  // Use the paper's published threshold (0.20) so reported metrics line up
  // with main.tex Table I and supplementary.tex section 4.4.
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < N; i++) {
    const z = Z[i];
    const logit = b + z.reduce((sum, val, idx) => sum + w[idx] * val, 0);
    const p = sigmoid(logit);
    const pred = p >= 0.20;
    const y = labels[i];

    if (pred && y === 1) tp++;
    else if (pred && y === 0) fp++;
    else if (!pred && y === 0) tn++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  console.log('\n[Trainer v1] Training Performance (at paper threshold theta=0.20):');
  console.log(`  Accuracy:  ${((tp + tn) / N * 100).toFixed(2)}%`);
  console.log(`  Precision: ${precision.toFixed(4)}`);
  console.log(`  Recall:    ${recall.toFixed(4)}`);
  console.log(`  F1-Score:  ${f1.toFixed(4)}`);

  // ── 5. Write the Classifier File ──
  console.log(`\n[Trainer v1] Writing ${CLASSIFIER_PATH}...`);
  if (CLASSIFIER_PATH === CLASSIFIER_LIVE_PATH) {
    console.log('[Trainer v1] WARNING: about to overwrite the paper snapshot at fraud.classifier.ts.');
  } else {
    console.log('[Trainer v1] Writing to candidate file; paper snapshot at fraud.classifier.ts is untouched.');
  }

  const isLive = CLASSIFIER_PATH === CLASSIFIER_LIVE_PATH;
  const banner = isLive
    ? `// =============================================================================
// PAPER_SNAPSHOT: 2026-06-01
// =============================================================================
// These constants are the model published in:
//   "Real-Time Shill-Bidding Detection via Online Bid-Graph Analytics in Live
//    Auction Platforms" (IEEE submission, 2026-06-01).
//
// Regenerated by packages/simulator/src/train.ts on ${new Date().toISOString().split('T')[0]}
// from the preserved corpus under back/packages/simulator/runs/_paper-snapshot/.
//
// DO NOT mutate the constants below without simultaneously regenerating the
// paper figures. The supplementary's "complete source code" section (sec. 3.4)
// reproduces these values verbatim; any drift breaks paper reproducibility.
// =============================================================================`
    : `// =============================================================================
// CANDIDATE WEIGHTS (not yet promoted)
// =============================================================================
// Generated by packages/simulator/src/train.ts on ${new Date().toISOString().split('T')[0]}
// from runs under: ${RUNS_DIR}
//
// To promote these into the paper snapshot:
//   npx ts-node packages/simulator/src/train.ts --write --confirm
// (only do this when regenerating paper figures from preserved corpus).
// =============================================================================`;

  const newContent = `${banner}
//
// Logistic-regression classifier for real-time shill-bid scoring.
//
// TRAINING METRICS (at paper threshold theta=0.20):
//   - Accuracy:  ${((tp + tn) / N * 100).toFixed(2)}%
//   - Precision: ${precision.toFixed(4)}
//   - Recall:    ${recall.toFixed(4)}
//   - F1-Score:  ${f1.toFixed(4)}

import { FeatureVector, ClassifierWeights, NormParams } from './fraud.types';

/**
 * Logistic-regression weights (log-odds scale, pre-normalisation).
 * Positive = increases fraud score; negative = decreases it.
 *
 * Derived via batch gradient descent with L2 regularisation
 * (alpha=0.20, lambda=0.01, epochs=10000).
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
 * Normalisation parameters derived empirically from training.
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
  console.log(`[Trainer v1] Wrote ${CLASSIFIER_PATH}`);
  if (CLASSIFIER_PATH === CLASSIFIER_CANDIDATE_PATH) {
    console.log('[Trainer v1] Paper snapshot at fraud.classifier.ts was NOT modified.');
    console.log('[Trainer v1] Diff candidate vs live to decide whether to promote:');
    console.log('[Trainer v1]   diff back/src/modules/fraud/fraud.classifier.ts back/src/modules/fraud/fraud.classifier.candidate.ts');
  } else {
    console.log('[Trainer v1] PAPER SNAPSHOT OVERWRITTEN. Regenerate paper figures next:');
    console.log('[Trainer v1]   npm run eval:fraud');
  }
}

train().catch(console.error);
