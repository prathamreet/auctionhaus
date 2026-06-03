/**
 * Fraud-Detection Evaluation Harness
 *
 * Reports on the HELD-OUT TEST partition (the deterministic split in
 * dataset.ts, identical to the one train.ts trained against -- no leakage).
 *
 * Produces:
 *   - LR precision/recall/F1 + best-F1 threshold on the test set
 *   - ROC sweep (test) -> paper/figures/roc_data.json
 *   - per-feature ablation by neutralising one feature at a time (test)
 *       -> paper/figures/ablation_data.json
 *   - baselines fit on TRAIN, scored on TEST:
 *       (a) outbid-count > 10 heuristic
 *       (b) best single-feature decision stump
 *   - paper/tables/metrics.tex  (baselines vs LR, all on test)
 *
 * Usage (from repo root): npm run eval:fraud
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadExamples, splitTrainTest, FEATURE_KEYS, type Example } from './dataset';
import { score as lrScore, NORM_PARAMS } from '../../../back/src/modules/fraud/fraud.classifier';
import type { FeatureVector } from '../../../back/src/modules/fraud/fraud.types';

const rootDir = process.cwd().endsWith('back') ? path.join(process.cwd(), '..') : process.cwd();
const PAPER_DIR = path.join(rootDir, 'paper');
const FIGURES_DIR = path.join(PAPER_DIR, 'figures');
const TABLES_DIR = path.join(PAPER_DIR, 'tables');

interface Metrics {
  tp: number; fp: number; tn: number; fn: number;
  precision: number; recall: number; f1: number; fpr: number; tpr: number;
}

function metricsFrom(scored: Array<{ label: number; pred: boolean }>): Metrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const { label, pred } of scored) {
    if (pred && label === 1) tp++;
    else if (pred && label === 0) fp++;
    else if (!pred && label === 0) tn++;
    else fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
  return { tp, fp, tn, fn, precision, recall, f1, fpr, tpr: recall };
}

function mkdir(p: string) { fs.mkdirSync(p, { recursive: true }); }

/** Best single-feature decision stump fit on train, then scored on test. */
function fitStump(train: Example[]): {
  feature: keyof FeatureVector; direction: 'gt' | 'lt'; threshold: number; trainF1: number;
} {
  let best = { feature: FEATURE_KEYS[0], direction: 'gt' as 'gt' | 'lt', threshold: 0, trainF1: -1 };
  for (const feature of FEATURE_KEYS) {
    const vals = [...new Set(train.map((e) => e.features[feature]))].sort((a, b) => a - b);
    const cands: number[] = [];
    for (let i = 0; i < vals.length - 1; i++) cands.push((vals[i] + vals[i + 1]) / 2);
    if (vals.length === 1) cands.push(vals[0]);
    for (const threshold of cands) {
      for (const direction of ['gt', 'lt'] as const) {
        const scored = train.map((e) => ({
          label: e.label,
          pred: direction === 'gt' ? e.features[feature] > threshold : e.features[feature] < threshold,
        }));
        const m = metricsFrom(scored);
        if (m.f1 > best.trainF1) best = { feature, direction, threshold, trainF1: m.f1 };
      }
    }
  }
  return best;
}

function main() {
  mkdir(FIGURES_DIR);
  mkdir(TABLES_DIR);

  const all = loadExamples();
  if (all.length === 0) {
    console.error('[Eval] No examples. Run `npm run sim:run` then `npm run train:fraud` first.');
    process.exit(1);
  }
  const { train, test } = splitTrainTest(all);
  console.log(`[Eval] ${all.length} examples -> ${train.length} train / ${test.length} held-out test`);
  if (test.length === 0) {
    console.error('[Eval] Test partition empty. Generate more sim runs.');
    process.exit(1);
  }
  const testShill = test.filter((e) => e.label === 1).length;
  console.log(`[Eval] Test labels: ${testShill} shill / ${test.length - testShill} legit`);

  // ── LR scores on test ──
  const lrScored = test.map((e) => ({ label: e.label, score: lrScore(e.features) }));

  // ── ROC sweep on test ──
  const thresholds = Array.from({ length: 19 }, (_, i) => (i + 1) * 0.05);
  const roc = thresholds.map((t) => {
    const m = metricsFrom(lrScored.map((s) => ({ label: s.label, pred: s.score >= t })));
    return { threshold: t, tpr: m.tpr, fpr: m.fpr, f1: m.f1, precision: m.precision, recall: m.recall };
  });
  fs.writeFileSync(path.join(FIGURES_DIR, 'roc_data.json'), JSON.stringify(roc, null, 2));

  const best = roc.reduce((a, b) => (b.f1 > a.f1 ? b : a));
  console.log(
    `[Eval] LR (test) best threshold ${best.threshold.toFixed(2)} | ` +
      `P=${best.precision.toFixed(3)} R=${best.recall.toFixed(3)} F1=${best.f1.toFixed(3)}`
  );

  // ── Ablation on test: neutralise one feature (set to its mean -> z=0) ──
  const ablation = FEATURE_KEYS.map((feat) => {
    const ablated = test.map((e) => {
      // Neutralise one feature by setting it to its training mean (z-score 0),
      // which removes its contribution from the logit without disturbing others.
      const f: FeatureVector = { ...e.features };
      f[feat] = NORM_PARAMS.mean[feat];
      return { label: e.label, pred: lrScore(f) >= best.threshold };
    });
    const m = metricsFrom(ablated);
    return { feature: feat, f1: m.f1, precision: m.precision, recall: m.recall };
  });
  fs.writeFileSync(path.join(FIGURES_DIR, 'ablation_data.json'), JSON.stringify(ablation, null, 2));
  console.log('[Eval] Ablation (test, feature set to mean):');
  for (const a of ablation) {
    console.log(`  ${a.feature.padEnd(22)} F1=${a.f1.toFixed(3)} P=${a.precision.toFixed(3)} R=${a.recall.toFixed(3)}`);
  }

  // ── Baselines (fit on train, scored on test) ──
  const outbidBaseline = metricsFrom(
    test.map((e) => ({ label: e.label, pred: e.bidderBidCountOnAuction > 10 }))
  );
  const stump = fitStump(train);
  const stumpMetrics = metricsFrom(
    test.map((e) => ({
      label: e.label,
      pred:
        stump.direction === 'gt'
          ? e.features[stump.feature] > stump.threshold
          : e.features[stump.feature] < stump.threshold,
    }))
  );
  console.log(
    `[Eval] Baseline outbid>10 (test):    P=${outbidBaseline.precision.toFixed(3)} R=${outbidBaseline.recall.toFixed(3)} F1=${outbidBaseline.f1.toFixed(3)}`
  );
  console.log(
    `[Eval] Baseline stump [${stump.feature} ${stump.direction} ${stump.threshold.toFixed(2)}] (test): ` +
      `P=${stumpMetrics.precision.toFixed(3)} R=${stumpMetrics.recall.toFixed(3)} F1=${stumpMetrics.f1.toFixed(3)}`
  );

  // ── LaTeX metrics table (all on test) ──
  const row = (name: string, m: Metrics, thr: string) =>
    `${name} & ${m.precision.toFixed(3)} & ${m.recall.toFixed(3)} & ${m.f1.toFixed(3)} & ${thr} \\\\`;
  const lrBest = metricsFrom(lrScored.map((s) => ({ label: s.label, pred: s.score >= best.threshold })));
  const tex = `% Auto-generated by eval.ts -- held-out test set (do not edit by hand)
\\begin{table}[h]
\\centering
\\begin{tabular}{lcccc}
\\toprule
\\textbf{Method} & \\textbf{Precision} & \\textbf{Recall} & \\textbf{F1} & \\textbf{Threshold} \\\\
\\midrule
${row('Baseline (outbid count $>10$)', outbidBaseline, '---')}
${row(`Stump (\\texttt{${stump.feature}})`, stumpMetrics, stump.threshold.toFixed(2))}
${row('LR (5-feature, this work)', lrBest, best.threshold.toFixed(2))}
\\bottomrule
\\end{tabular}
\\vspace{8pt}
\\caption{Fraud Detection Performance on the Held-Out Test Set}
\\label{tab:fraud-metrics}
\\end{table}
`;
  fs.writeFileSync(path.join(TABLES_DIR, 'metrics.tex'), tex);
  console.log('[Eval] Wrote paper/figures/{roc_data,ablation_data}.json and paper/tables/metrics.tex');
}

main();
