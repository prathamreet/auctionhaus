/**
 * Phase C7 — k6 Bid Throughput Benchmark
 *
 * Measures bid placement latency under increasing concurrency for two modes:
 *   1. Direct Postgres (FOR UPDATE) — POST /api/bids/auctions/:id
 *   2. Redis Stream sequencer       — POST /api/bids/auctions/:id/stream (TODO: add this route)
 *
 * Usage:
 *   # Install k6: https://k6.io/docs/getting-started/installation/
 *   k6 run packages/simulator/k6/bid-throughput.js --vus 10 --duration 30s
 *   k6 run packages/simulator/k6/bid-throughput.js --vus 50 --duration 30s
 *   k6 run packages/simulator/k6/bid-throughput.js --vus 100 --duration 30s
 *
 * Pre-requisites:
 *   1. Backend running at http://localhost:5000
 *   2. SIM_TOKEN env set to a valid JWT:
 *      k6 run ... -e SIM_TOKEN=<jwt>  -e AUCTION_ID=<uuid>
 *
 * Results are printed as a k6 summary table. Copy p50/p99 values into
 * docs/architecture/sequencer.md and paper/main.tex Table III.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const bidLatency = new Trend('bid_latency', true);
const bidErrors  = new Counter('bid_errors');

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: __ENV.VUS ? parseInt(__ENV.VUS) : 10,
      duration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    'bid_latency{mode:direct}': ['p(99)<2000'],
    'bid_latency{mode:stream}': ['p(99)<500'],
    'bid_errors': ['count<5'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:5000/api';
const TOKEN = __ENV.SIM_TOKEN || '';
const AUCTION_ID = __ENV.AUCTION_ID || '';

if (!TOKEN || !AUCTION_ID) {
  console.error('Set SIM_TOKEN and AUCTION_ID env vars');
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

// Spread bid amounts so each VU bids a unique incrementing amount
let bidBase = 1000;

export default function () {
  const amount = bidBase + Math.floor(Math.random() * 10000);
  const mode = __ENV.MODE === 'stream' ? 'stream' : 'direct';
  const url = mode === 'stream'
    ? `${BASE}/bids/auctions/${AUCTION_ID}/stream`
    : `${BASE}/bids/auctions/${AUCTION_ID}`;

  const res = http.post(
    url,
    JSON.stringify({ amount }),
    { headers, tags: { mode } }
  );
  bidLatency.add(res.timings.duration, { mode });

  const ok = check(res, {
    'bid accepted (2xx, 202, or 400 expected)': (r) =>
      r.status === 201 || r.status === 200 || r.status === 202 || r.status === 400,
  });
  if (!ok) bidErrors.add(1);

  sleep(0.1);
}

export function handleSummary(data) {
  const fmt = (v) => (v === undefined ? '—' : v.toFixed(1) + 'ms');

  const direct = data.metrics['bid_latency{mode:direct}'];
  const stream = data.metrics['bid_latency{mode:stream}'];

  const table = [
    '┌─────────────────────────────────────────────────────────────────┐',
    '│              AuctionHaus Bid Throughput Benchmark               │',
    '├──────────────────────┬──────────────┬──────────────┬────────────┤',
    '│ Mode                 │ p50          │ p95          │ p99        │',
    '├──────────────────────┼──────────────┼──────────────┼────────────┤',
    `│ Direct (FOR UPDATE)  │ ${fmt(direct?.values?.['p(50)'])}       │ ${fmt(direct?.values?.['p(95)'])}       │ ${fmt(direct?.values?.['p(99)'])}    │`,
    `│ Redis Stream         │ ${fmt(stream?.values?.['p(50)'])}       │ ${fmt(stream?.values?.['p(95)'])}       │ ${fmt(stream?.values?.['p(99)'])}    │`,
    '└──────────────────────┴──────────────┴──────────────┴────────────┘',
    '',
    `VUs: ${__ENV.VUS || 10}   Duration: ${__ENV.DURATION || '30s'}`,
    '',
    'Copy into paper/main.tex Table III and docs/architecture/sequencer.md',
  ].join('\n');

  return {
    stdout: table,
    'paper/figures/k6_summary.txt': JSON.stringify(data, null, 2),
  };
}
