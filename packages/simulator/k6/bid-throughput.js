/**
 * k6 Bid Throughput Benchmark
 *
 * Measures bid latency + throughput under increasing concurrency for two modes:
 *   1. Direct Postgres (FOR UPDATE)  -> POST /api/bids/auctions/:id
 *   2. Redis Stream sequencer        -> POST /api/bids/auctions/:id/stream
 *
 * This is a MEASUREMENT harness, not an SLO gate: it has no failing thresholds,
 * so a run always exits cleanly and just reports numbers. It prints p50/p95/p99,
 * iterations, iterations/sec, and how many requests were rejected (bid_errors).
 *
 * IMPORTANT — start the backend so the benchmark measures the real system, not
 * artefacts:
 *   - RATE_LIMIT_MAX=100000000   so the global limiter doesn't 429 the load
 *                                (a single localhost IP fires thousands of reqs;
 *                                 the default cap of 1000/15min would otherwise
 *                                 reject most of them and corrupt the numbers).
 *   - BID_SEQUENCER=true         so the stream consumer actually drains the
 *                                stream and PROCESSES bids (stream mode returns
 *                                202 on enqueue; without the consumer the bids
 *                                are never applied and the stream backs up).
 *   - BID_STREAM_BACKPRESSURE=100000  so the sequencer doesn't 503 under load
 *                                (raise it for a pure-throughput measurement).
 *
 *   Example (PowerShell):
 *     $env:RATE_LIMIT_MAX="100000000"; $env:BID_SEQUENCER="true"; `
 *       $env:BID_STREAM_BACKPRESSURE="100000"; npm run dev:back
 *
 * Then (from repo root), per mode/VU level:
 *   k6 run packages/simulator/k6/bid-throughput.js \
 *     -e SIM_TOKEN=<jwt> -e AUCTION_ID=<uuid> -e VUS=100 -e DURATION=15s -e MODE=stream
 *
 * `npm run db:prepare-bench` prints a ready-to-paste token + auction id + the
 * exact commands.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const bidLatency = new Trend('bid_latency', true);
const bidErrors = new Counter('bid_errors');

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: __ENV.VUS ? parseInt(__ENV.VUS) : 10,
      duration: __ENV.DURATION || '30s',
    },
  },
  // Compute the percentiles we actually report. (k6's default Trend stats omit
  // p50 and p99, which is why the old summary showed "—" for those columns.)
  summaryTrendStats: ['avg', 'min', 'med', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max'],
  // No failing thresholds on purpose: this harness measures, it does not assert.
};

const BASE = __ENV.BASE_URL || 'http://localhost:5000/api';
const TOKEN = __ENV.SIM_TOKEN || '';
const AUCTION_ID = __ENV.AUCTION_ID || '';

if (!TOKEN || !AUCTION_ID) {
  throw new Error('Set SIM_TOKEN and AUCTION_ID env vars (see `npm run db:prepare-bench`).');
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

export default function () {
  // VU + iteration keep bid amounts monotonically increasing so they stay above
  // the rising currentPrice (English) instead of bouncing off min-increment.
  const amount = 1000 + __ITER * 100 + __VU * 10;
  const mode = __ENV.MODE === 'stream' ? 'stream' : 'direct';
  const url =
    mode === 'stream'
      ? `${BASE}/bids/auctions/${AUCTION_ID}/stream`
      : `${BASE}/bids/auctions/${AUCTION_ID}`;

  const res = http.post(url, JSON.stringify({ amount }), { headers, tags: { mode } });
  bidLatency.add(res.timings.duration, { mode });

  // Accepted = processed (200/201), queued (202), or a legitimate business
  // rejection (400, e.g. bid below current price). Anything else -- 429 rate
  // limit, 503 backpressure, 500 -- is a real error worth counting and means
  // the backend was not configured per the header notes above.
  const ok = check(res, {
    'bid accepted (200/201/202/400)': (r) =>
      r.status === 200 || r.status === 201 || r.status === 202 || r.status === 400,
  });
  if (!ok) bidErrors.add(1);

  sleep(0.1);
}

export function handleSummary(data) {
  const ms = (v) => (v === undefined || v === null ? '—' : v.toFixed(1) + 'ms');
  const mode = __ENV.MODE === 'stream' ? 'stream' : 'direct';
  const lat = data.metrics[`bid_latency{mode:${mode}}`]?.values || {};
  const iters = data.metrics.iterations?.values || {};
  const errs = data.metrics.bid_errors?.values?.count || 0;
  const failed = data.metrics.http_req_failed?.values?.passes || 0;

  const label = mode === 'stream' ? 'Redis Stream (enqueue)' : 'Direct (FOR UPDATE)';

  const lines = [
    '┌──────────────────────────────────────────────────────────────┐',
    '│            AuctionHaus Bid Throughput Benchmark              │',
    '├──────────────────────────────────────────────────────────────┤',
    `│ Mode        : ${label.padEnd(46)}│`,
    `│ VUs         : ${String(__ENV.VUS || 10).padEnd(46)}│`,
    `│ Duration    : ${String(__ENV.DURATION || '30s').padEnd(46)}│`,
    '├──────────────────────────────────────────────────────────────┤',
    `│ p50         : ${ms(lat['p(50)'] ?? lat.med).padEnd(46)}│`,
    `│ p95         : ${ms(lat['p(95)']).padEnd(46)}│`,
    `│ p99         : ${ms(lat['p(99)']).padEnd(46)}│`,
    `│ iterations  : ${String(iters.count ?? 0).padEnd(46)}│`,
    `│ iters/sec   : ${String((iters.rate ?? 0).toFixed(1)).padEnd(46)}│`,
    `│ bid_errors  : ${String(errs).padEnd(46)}│`,
    '└──────────────────────────────────────────────────────────────┘',
    '',
    errs > 0
      ? `WARNING: ${errs} request(s) were rejected (429/503/500). Re-check the backend env (RATE_LIMIT_MAX / BID_SEQUENCER / BID_STREAM_BACKPRESSURE) -- these numbers are contaminated.`
      : 'All requests accepted. Numbers are clean.',
    '',
    'Record p50/p95/p99 + iters/sec into paper/figures/k6_results.json.',
  ].join('\n');

  return {
    stdout: lines + '\n',
    'paper/figures/k6_summary.txt': JSON.stringify(data, null, 2),
  };
}
