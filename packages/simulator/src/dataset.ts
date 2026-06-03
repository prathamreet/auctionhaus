/**
 * Shared dataset loader for the fraud-detection train/eval pipeline.
 *
 * Both train.ts and eval.ts import from here so that:
 *   1. Feature extraction is done exactly once, the same way, for both.
 *   2. The sellerCoOccurrence feature is grounded in the REAL auction owner
 *      (manifest.auctionOwners[auctionId]) -- not a guessed agent. This is the
 *      correction that the rejected-paper version could not ship without the
 *      published weights becoming fabricated.
 *   3. The train/test split is deterministic, so train.ts fits on the train
 *      partition and eval.ts reports on the held-out test partition with no
 *      leakage and no cross-process disagreement.
 *
 * Runs are read from packages/simulator/runs/ EXCLUDING any directory whose
 * name starts with "_" (e.g. _paper-snapshot, _post-paper). Those hold the
 * old single-auction corpus of the rejected submission and are kept only for
 * provenance.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BidLogEntry, SimRunManifest } from './types';
import { extractFeatures } from '../../../back/src/modules/fraud/fraud.features';
import { BidGraph } from '../../../back/src/modules/fraud/fraud.graph';
import type { BidEvent, FeatureVector } from '../../../back/src/modules/fraud/fraud.types';

export interface Example {
  features: FeatureVector;
  label: number; // 1 = shill/collusion, 0 = truthful/sniper
  isShill: boolean;
  bidId: string;
  runId: string;
  auctionId: string;
  agentType: BidLogEntry['agentType'];
  /** Bidder's running bid count on this auction at the moment of this bid.
   *  Used by the outbid-count baseline in eval.ts. */
  bidderBidCountOnAuction: number;
}

/** Resolve the runs directory regardless of cwd (repo root or back/). */
export function resolveRunsDir(): string {
  const root = process.cwd().endsWith('back')
    ? path.join(process.cwd(), '..')
    : process.cwd();
  return path.join(root, 'back', 'packages', 'simulator', 'runs');
}

/** List active run directories (excludes underscore-prefixed archives). */
export function listRunDirs(runsDir = resolveRunsDir()): string[] {
  if (!fs.existsSync(runsDir)) return [];
  return fs
    .readdirSync(runsDir)
    .filter((name) => !name.startsWith('_'))
    .map((name) => path.join(runsDir, name))
    .filter(
      (p) =>
        fs.statSync(p).isDirectory() &&
        fs.existsSync(path.join(p, 'events.jsonl')) &&
        fs.existsSync(path.join(p, 'manifest.json'))
    );
}

/**
 * Replay every run through the production BidGraph + extractFeatures and
 * return a flat list of labelled examples.
 *
 * One graph per run (sellerCoOccurrence is only meaningful within a run, where
 * a single primary seller owns several auctions). Events are sorted by
 * timestamp before replay so response-time and reciprocity see true order.
 */
export function loadExamples(runsDir = resolveRunsDir()): Example[] {
  const out: Example[] = [];
  const runDirs = listRunDirs(runsDir);

  for (const runDir of runDirs) {
    const manifest: SimRunManifest = JSON.parse(
      fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8')
    );

    if (!manifest.auctionOwners || Object.keys(manifest.auctionOwners).length === 0) {
      console.warn(
        `[dataset] SKIP ${path.basename(runDir)}: manifest has no auctionOwners ` +
          `(pre-correction run). Regenerate it with the current run.ts.`
      );
      continue;
    }

    const events: BidLogEntry[] = fs
      .readFileSync(path.join(runDir, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    events.sort((a, b) => a.ts - b.ts);

    const graph = new BidGraph();
    // Per-bidder-per-auction running count for the outbid-count baseline.
    const bidCount = new Map<string, number>();

    for (const e of events) {
      const sellerId = manifest.auctionOwners[e.auctionId] ?? 'unknown';
      const event: BidEvent = {
        bidId: `${manifest.runId}-${e.ts}-${e.bidderId}`,
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

      const countKey = `${e.auctionId}:${e.bidderId}`;
      const priorCount = bidCount.get(countKey) ?? 0;
      bidCount.set(countKey, priorCount + 1);

      out.push({
        features,
        label: e.isShill ? 1 : 0,
        isShill: e.isShill,
        bidId: event.bidId,
        runId: manifest.runId,
        auctionId: e.auctionId,
        agentType: e.agentType,
        bidderBidCountOnAuction: priorCount + 1,
      });
    }
  }

  return out;
}

/** Deterministic 32-bit FNV-1a hash of a string (stable across processes). */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic train/test split keyed on bidId. The same example always lands
 * in the same partition no matter which process (train.ts or eval.ts) computes
 * it, so the test set is a true hold-out with zero leakage.
 *
 * Default testFraction = 0.2 (every example whose hash falls in the bottom
 * fifth of the 32-bit space is a test example).
 */
export function splitTrainTest(
  examples: Example[],
  testFraction = 0.2
): { train: Example[]; test: Example[] } {
  const cutoff = testFraction * 0xffffffff;
  const train: Example[] = [];
  const test: Example[] = [];
  for (const ex of examples) {
    if (fnv1a(ex.bidId) < cutoff) test.push(ex);
    else train.push(ex);
  }
  return { train, test };
}

export const FEATURE_KEYS: Array<keyof FeatureVector> = [
  'responseTimeMs',
  'bidFrequencyPerMin',
  'incrementRatio',
  'sellerCoOccurrence',
  'reciprocityScore',
];
