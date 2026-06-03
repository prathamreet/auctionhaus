// =============================================================================
// CORRECTED TRAINER (v2) -- post-submission improvement
// =============================================================================
// This is the paper-aware corrected pipeline. It addresses one methodological
// issue documented in reaching-rp.md (Category B1):
//
//   v1 (paper-faithful): sellerId is picked as the manifest's first truthful
//                        agent's userId. This was wrong but is what produced
//                        the published weights. We preserve it for paper
//                        reproducibility in train.ts (the filename the
//                        supplementary references; logs use a "v1" marker).
//
//   v2 (this file):      sellerId is read from manifest.auctionOwners, the
//                        real auction owner recorded by run.ts. Matches the
//                        semantics of the production FraudEngine in
//                        back/src/modules/bidding/bid.service.ts:266.
//
// v2 ALWAYS writes to fraud.classifier.candidate.v2.ts -- it never touches
// the paper snapshot at fraud.classifier.ts. The intent is to surface
// post-submission improvements without breaking paper reproducibility.
//
// v2 SKIPS runs whose manifest lacks `auctionOwners` (paper-snapshot runs
// from before 2026-06-02). Falling back to a guessed seller would silently
// re-introduce the v1 imperfection; surfacing the skip in the console makes
// the corpus boundary explicit.
//
// Usage:
//   npx ts-node packages/simulator/src/train.v2.ts
//
// Compare to live snapshot:
//   diff back/src/modules/fraud/fraud.classifier.ts \
//        back/src/modules/fraud/fraud.classifier.candidate.v2.ts
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type { BidLogEntry, SimRunManifest } from './types';
import { extractFeatures } from '../../../back/src/modules/fraud/fraud.features';
import { BidGraph } from '../../../back/src/modules/fraud/fraud.graph';
import type { BidEvent, FeatureVector } from '../../../back/src/modules/fraud/fraud.types';

// ── Paths ────────────────────────────────────────────────────────────────────
const rootDir = process.cwd().endsWith('back') ? path.join(process.cwd(), '..') : process.cwd();
const RUNS_BASE = path.join(rootDir, 'back', 'packages', 'simulator', 'runs');
// v2 reads from _post-paper/ and any flat new runs, but NEVER from
// _paper-snapshot/. The snapshot corpus is for v1 reproducibility only.
const CANDIDATE_DIRS = [
  path.join(RUNS_BASE, '_post-paper'),
  RUNS_BASE,
];
const CLASSIFIER_CANDIDATE_V2_PATH = path.join(
  rootDir,
  'back',
  'src',
  'modules',
  'fraud',
  'fraud.classifier.candidate.v2.ts'
);

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function collectRunDirs(): string[] {
  const out: string[] = [];
  for (const base of CANDIDATE_DIRS) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      if (name.startsWith('_')) continue;
      const p = path.join(base, name);
      if (!fs.statSync(p).isDirectory()) continue;
      if (!fs.existsSync(path.join(p, 'events.jsonl'))) continue;
      if (!fs.existsSync(path.join(p, 'manifest.json'))) continue;
      out.push(p);
    }
  }
  return out;
}

async function train() {
  console.log('[Trainer v2] Corrected logistic regression training pipeline');
  console.log('[Trainer v2] Snapshot at back/src/modules/fraud/fraud.classifier.ts is NEVER modified.');
  console.log(`[Trainer v2] Output target: ${CLASSIFIER_CANDIDATE_V2_PATH}`);

  const runDirs = collectRunDirs();
  if (runDirs.length === 0) {
    console.error('[Trainer v2] No eligible runs found.');
    console.error('[Trainer v2] Searched:');
    for (const d of CANDIDATE_DIRS) console.error(`  ${d}`);
    console.error('[Trainer v2] Run `npm run sim:run` first to produce a manifest with auctionOwners.');
    process.exit(1);
  }
  console.log(`[Trainer v2] Found ${runDirs.length} candidate run directories.`);

  const featuresList: FeatureVector[] = [];
  const labels: number[] = [];
  let usedRuns = 0;
  let skippedRuns = 0;

  for (const runDir of runDirs) {
    const eventsPath = path.join(runDir, 'events.jsonl');
    const manifestPath = path.join(runDir, 'manifest.json');
    const manifest: SimRunManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    if (!manifest.auctionOwners || Object.keys(manifest.auctionOwners).length === 0) {
      console.warn(`[Trainer v2] SKIP ${path.basename(runDir)}: manifest lacks auctionOwners (paper-snapshot era; use train.ts for this run).`);
      skippedRuns++;
      continue;
    }

    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean);
    const events: BidLogEntry[] = lines.map((l) => JSON.parse(l));

    const graph = new BidGraph();
    for (const e of events) {
      const realSellerId = manifest.auctionOwners[e.auctionId] ?? 'unknown';
      const event: BidEvent = {
        bidId: `train-v2-${e.ts}-${e.bidderId}`,
        auctionId: e.auctionId,
        bidderId: e.bidderId,
        bidderName: manifest.agentMap[e.bidderId]?.agentType ?? 'unknown',
        sellerId: realSellerId,
        auctionTitle: 'Training Auction (v2)',
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
    usedRuns++;
  }

  console.log(`[Trainer v2] Used ${usedRuns} runs, skipped ${skippedRuns}.`);
  const N = featuresList.length;
  if (N === 0) {
    console.error('[Trainer v2] No eligible bid events. Run a fresh sim with the new run.ts (manifest now records auctionOwners).');
    process.exit(1);
  }
  console.log(`[Trainer v2] Extracted ${N} training examples (${labels.filter((l) => l === 1).length} shill / ${labels.filter((l) => l === 0).length} truthful).`);

  // ── Mean / Std ──────────────────────────────────────────────────────────
  const keys: Array<keyof FeatureVector> = [
    'responseTimeMs',
    'bidFrequencyPerMin',
    'incrementRatio',
    'sellerCoOccurrence',
    'reciprocityScore',
  ];

  const mean: FeatureVector = {
    responseTimeMs: 0, bidFrequencyPerMin: 0, incrementRatio: 0,
    sellerCoOccurrence: 0, reciprocityScore: 0,
  };
  const std: FeatureVector = {
    responseTimeMs: 0, bidFrequencyPerMin: 0, incrementRatio: 0,
    sellerCoOccurrence: 0, reciprocityScore: 0,
  };

  for (const f of featuresList) for (const k of keys) mean[k] += f[k];
  for (const k of keys) mean[k] /= N;
  for (const f of featuresList) for (const k of keys) std[k] += Math.pow(f[k] - mean[k], 2);
  for (const k of keys) { std[k] = Math.sqrt(std[k] / N); if (std[k] === 0) std[k] = 1.0; }

  console.log('\n[Trainer v2] Empirical NORM_PARAMS:');
  console.log('Mean:', mean);
  console.log('Std: ', std);

  // ── Normalise + train ───────────────────────────────────────────────────
  const Z: number[][] = featuresList.map((f) => keys.map((k) => (f[k] - mean[k]) / std[k]));
  let w = [0, 0, 0, 0, 0];
  let b = 0;
  const alpha = 0.2;
  const lambda = 0.01;
  const epochs = 10000;
  console.log(`\n[Trainer v2] Training (epochs=${epochs}, alpha=${alpha}, lambda=${lambda})...`);

  for (let t = 1; t <= epochs; t++) {
    const predictions: number[] = [];
    for (let i = 0; i < N; i++) {
      const z = Z[i];
      const logit = b + z.reduce((sum, val, idx) => sum + w[idx] * val, 0);
      predictions.push(sigmoid(logit));
    }
    const dw = [0, 0, 0, 0, 0];
    let db = 0;
    for (let i = 0; i < N; i++) {
      const diff = predictions[i] - labels[i];
      db += diff;
      for (let j = 0; j < 5; j++) dw[j] += diff * Z[i][j];
    }
    db /= N;
    for (let j = 0; j < 5; j++) dw[j] = dw[j] / N + lambda * w[j];
    b -= alpha * db;
    for (let j = 0; j < 5; j++) w[j] -= alpha * dw[j];

    if (t === 1 || t % 2000 === 0) {
      let loss = 0;
      for (let i = 0; i < N; i++) {
        const p = predictions[i];
        const y = labels[i];
        loss -= y * Math.log(Math.max(1e-15, p)) + (1 - y) * Math.log(Math.max(1e-15, 1 - p));
      }
      loss = loss / N + (lambda / 2) * w.reduce((s, v) => s + v * v, 0);
      console.log(`  Epoch ${t}/${epochs} | Loss: ${loss.toFixed(6)}`);
    }
  }

  const learnedWeights = {
    intercept: Number(b.toFixed(4)),
    responseTimeMs: Number(w[0].toFixed(4)),
    bidFrequencyPerMin: Number(w[1].toFixed(4)),
    incrementRatio: Number(w[2].toFixed(4)),
    sellerCoOccurrence: Number(w[3].toFixed(4)),
    reciprocityScore: Number(w[4].toFixed(4)),
  };
  console.log('\n[Trainer v2] Learned Weights:', learnedWeights);

  // ── Evaluate at paper threshold ─────────────────────────────────────────
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
  console.log('\n[Trainer v2] Training Performance (at paper threshold theta=0.20):');
  console.log(`  Accuracy:  ${((tp + tn) / N * 100).toFixed(2)}%`);
  console.log(`  Precision: ${precision.toFixed(4)}`);
  console.log(`  Recall:    ${recall.toFixed(4)}`);
  console.log(`  F1-Score:  ${f1.toFixed(4)}`);

  // ── Write candidate ─────────────────────────────────────────────────────
  const banner = `// =============================================================================
// CANDIDATE WEIGHTS (v2 corrected pipeline) -- NOT PROMOTED
// =============================================================================
// Generated by packages/simulator/src/train.v2.ts on ${new Date().toISOString().split('T')[0]}
// Corpus: ${usedRuns} runs (skipped ${skippedRuns} paper-snapshot runs that lack auctionOwners)
// Examples: ${N} (${labels.filter((l) => l === 1).length} shill / ${labels.filter((l) => l === 0).length} truthful)
//
// This file is the output of the corrected (real-sellerId) training pipeline.
// It is documented as a post-submission improvement and is NOT used at runtime.
// The runtime classifier is back/src/modules/fraud/fraud.classifier.ts, which
// matches the paper's published weights.
//
// To compare:
//   diff back/src/modules/fraud/fraud.classifier.ts back/src/modules/fraud/fraud.classifier.candidate.v2.ts
// =============================================================================`;

  const newContent = `${banner}
//
// TRAINING METRICS (at paper threshold theta=0.20):
//   - Accuracy:  ${((tp + tn) / N * 100).toFixed(2)}%
//   - Precision: ${precision.toFixed(4)}
//   - Recall:    ${recall.toFixed(4)}
//   - F1-Score:  ${f1.toFixed(4)}

import { ClassifierWeights, NormParams } from './fraud.types';

export const WEIGHTS_V2: ClassifierWeights = {
  intercept: ${learnedWeights.intercept},
  responseTimeMs: ${learnedWeights.responseTimeMs},
  bidFrequencyPerMin: ${learnedWeights.bidFrequencyPerMin},
  incrementRatio: ${learnedWeights.incrementRatio},
  reciprocityScore: ${learnedWeights.reciprocityScore},
  sellerCoOccurrence: ${learnedWeights.sellerCoOccurrence},
};

export const NORM_PARAMS_V2: NormParams = {
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

export const SCORE_THRESHOLD_V2 = 0.20;
`;

  fs.writeFileSync(CLASSIFIER_CANDIDATE_V2_PATH, newContent);
  console.log(`[Trainer v2] Wrote ${CLASSIFIER_CANDIDATE_V2_PATH}`);
  console.log('[Trainer v2] Paper snapshot at fraud.classifier.ts is untouched.');
}

train().catch(console.error);
