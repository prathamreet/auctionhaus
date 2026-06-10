/**
 * k6 Bid Throughput Benchmark
 *
 * Measures bid latency + throughput under increasing concurrency for two modes:
 *   1. Direct Postgres (FOR UPDATE)  -> POST /api/bids/auctions/:id          (201 on commit)
 *   2. Redis Stream sequencer        -> POST /api/bids/auctions/:id/stream   (202 on enqueue)
 *
 * This is a MEASUREMENT harness, not an SLO gate: it has no failing thresholds,
 * so a run always exits cleanly and just reports numbers.
 *
 * WHY THE BID AMOUNT IS TIME-SCALED:
 *   An English auction is monotonic -- every bid must exceed currentPrice +
 *   minIncrement. If the offered amount cannot keep pace with the rising price,
 *   requests get rejected (HTTP 400 "Minimum bid is X") and you end up measuring
 *   rejection throughput, not real bids. To avoid that, setup() reads the live
 *   currentPrice once, and every VU offers
 *       amount = base + inc + (elapsed_ms * 200) + __VU
 *   which climbs ~200/ms -- far faster than the price can rise (bounded by the
 *   accepted-bid rate * minIncrement) -- so bids stay valid for the whole run.
 *   This makes stream mode measure genuine 202 ENQUEUES and direct mode measure
 *   genuine 201 COMMITS (or the saturation that replaces them at high C).
 *
 * REQUIRED BACKEND ENV (so the benchmark measures the system, not artefacts):
 *   - RATE_LIMIT_MAX=100000000          global limiter won't 429 the load.
 *   - BID_SEQUENCER=true                stream consumer actually drains + processes.
 *   - BID_STREAM_BACKPRESSURE=100000    sequencer won't 503 under load.
 *
 *   Example (PowerShell):
 *     $env:RATE_LIMIT_MAX="100000000"; $env:BID_SEQUENCER="true"; `
 *       $env:BID_STREAM_BACKPRESSURE="100000"; npm run dev:back
 *
 * RECOMMENDED: run `npm run db:prepare-bench` for a fresh auction (price reset to
 * 1,000, wallet topped up) before a full sweep. setup() adapts to a reused
 * auction too, but a fresh one keeps amounts small.
 *
 * Then (from repo root), per mode/VU level:
 *   k6 run packages/simulator/k6/bid-throughput.js \
 *     -e SIM_TOKEN=<jwt> -e AUCTION_ID=<uuid> -e VUS=100 -e DURATION=15s -e MODE=stream
 *
 * Each run writes paper/figures/k6_<mode>_<vus>.json (no overwrite between runs).
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const bidLatency = new Trend('bid_latency', true); // accepted requests only
const accepted = new Counter('accepted'); // 200/201/202
const rejected = new Counter('rejected'); // 400 (business rejection: below min, etc.)
const errored = new Counter('errored'); // 429/503/500/timeouts -- real errors

const VUS = __ENV.VUS ? parseInt(__ENV.VUS) : 10;
const MODE = __ENV.MODE === 'stream' ? 'stream' : 'direct';
const DURATION = __ENV.DURATION || '30s';

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  // Compute the percentiles we actually report (k6's default Trend stats omit
  // p50 and p99, which is why the old summary showed "—" for those columns).
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

// Read the auction's live price ONCE so every VU can offer a bid above it.
export function setup() {
  const res = http.get(`${BASE}/auctions/${AUCTION_ID}`, { headers });
  let base = 1000;
  let inc = 10;
  try {
    const a = res.json();
    if (a && a.currentPrice != null) base = Number(a.currentPrice);
    if (a && a.minIncrement != null) inc = Number(a.minIncrement);
  } catch (_e) {
    // fall through to defaults
  }
  if (!isFinite(base)) base = 1000;
  if (!isFinite(inc)) inc = 10;
  console.log(`[setup] auction base price=${base} minIncrement=${inc} mode=${MODE} vus=${VUS}`);
  return { base, inc, start: Date.now() };
}

export default function (data) {
  // Time-scaled, strictly increasing: amount stays above the rising currentPrice
  // for the whole run. (elapsed_ms * 200) dominates the price rise; __VU (< 200)
  // disambiguates bids placed in the same millisecond.
  const elapsed = Date.now() - data.start;
  const amount = data.base + data.inc + elapsed * 200 + __VU;

  const url =
    MODE === 'stream'
      ? `${BASE}/bids/auctions/${AUCTION_ID}/stream`
      : `${BASE}/bids/auctions/${AUCTION_ID}`;

  const res = http.post(url, JSON.stringify({ amount }), { headers, tags: { mode: MODE } });
  const s = res.status;

  if (s === 200 || s === 201 || s === 202) {
    accepted.add(1);
    bidLatency.add(res.timings.duration, { mode: MODE });
  } else if (s === 400) {
    // Legitimate business rejection (e.g. below current price). Not an error,
    // but it should be ~0 with the time-scaled amount above; if it is high the
    // auction price outran the offer (reuse without prepare-bench).
    rejected.add(1);
  } else {
    // 429 rate-limit, 503 backpressure, 500 server/transaction error, timeouts.
    errored.add(1);
  }

  sleep(0.1);
}

export function handleSummary(data) {
  const ms = (v) => (v === undefined || v === null ? '—' : v.toFixed(1) + 'ms');
  // Each run is single-mode, so the untagged bid_latency trend == this mode.
  const lat = data.metrics.bid_latency?.values || {};
  const acc = data.metrics.accepted?.values || {};
  const rej = data.metrics.rejected?.values?.count || 0;
  const err = data.metrics.errored?.values?.count || 0;
  const iters = data.metrics.iterations?.values || {};

  const label = MODE === 'stream' ? 'Redis Stream (enqueue, 202)' : 'Direct (FOR UPDATE, 201)';
  const accCount = acc.count ?? 0;
  const accRate = (acc.rate ?? 0).toFixed(1);

  const lines = [
    '┌──────────────────────────────────────────────────────────────┐',
    '│            AuctionHaus Bid Throughput Benchmark              │',
    '├──────────────────────────────────────────────────────────────┤',
    `│ Mode        : ${label.padEnd(46)}│`,
    `│ VUs         : ${String(VUS).padEnd(46)}│`,
    `│ Duration    : ${String(DURATION).padEnd(46)}│`,
    '├──────────────────────────────────────────────────────────────┤',
    `│ accepted    : ${String(accCount).padEnd(46)}│`,
    `│ accepted/s  : ${String(accRate).padEnd(46)}│`,
    `│ rejected400 : ${String(rej).padEnd(46)}│`,
    `│ errored 5xx : ${String(err).padEnd(46)}│`,
    '├──────────────────────────────────────────────────────────────┤',
    `│ p50 (acc.)  : ${ms(lat['p(50)'] ?? lat.med).padEnd(46)}│`,
    `│ p95 (acc.)  : ${ms(lat['p(95)']).padEnd(46)}│`,
    `│ p99 (acc.)  : ${ms(lat['p(99)']).padEnd(46)}│`,
    `│ iterations  : ${String(iters.count ?? 0).padEnd(46)}│`,
    '└──────────────────────────────────────────────────────────────┘',
    '',
    err > 0
      ? `NOTE: ${err} request(s) returned 5xx. At high C in DIRECT mode this is genuine ` +
        `saturation (FOR UPDATE row-lock / connection-pool exhaustion). In STREAM mode, or ` +
        `at low C, a non-zero count means the backend env was wrong (RATE_LIMIT_MAX / ` +
        `BID_SEQUENCER / BID_STREAM_BACKPRESSURE).`
      : 'No 5xx errors.',
    rej > accCount
      ? `WARNING: more 400 rejections (${rej}) than accepted bids (${accCount}). The auction ` +
        `price outran the offered amount -- run \`npm run db:prepare-bench\` for a fresh auction.`
      : '',
    '',
    `Headline throughput = accepted/s (${accRate}). Saved to k6_${MODE}_${VUS}.json.`,
  ].join('\n');

  const out = {};
  out['stdout'] = lines + '\n';
  out[`paper/figures/k6_${MODE}_${VUS}.json`] = JSON.stringify(data, null, 2);
  return out;
}
