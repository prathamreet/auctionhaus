/**
 * Synthetic Bidder Simulator (multi-auction corpus generator)
 *
 * Generates a labelled bid corpus for the fraud-detection train/eval pipeline
 * by driving real HTTP traffic against the live AuctionHaus backend.
 *
 * Why multi-auction + a decoy seller:
 *   The dominant detection feature is seller co-occurrence (sigma) -- how many
 *   distinct auctions of the SAME seller a bidder targets within the window. A
 *   single auction per run makes sigma degenerate (always 0 or 1). Here a
 *   PRIMARY seller lists several auctions and a DECOY seller lists one:
 *     - shill / collusion bid across ALL of the primary seller's auctions
 *       (high sigma, seller-affiliated),
 *     - truthful / sniper bid on a single auction each, and a truthful bidder
 *       may also touch the decoy seller (low sigma per seller, yet "active"),
 *   so sigma separates seller-affiliated fraud from organic activity instead
 *   of separating "has bid at all".
 *
 * Each run writes:
 *   runs/{runId}/events.jsonl   -- one accepted bid per line, ground-truth labelled
 *   runs/{runId}/manifest.json  -- metadata incl. auctionOwners (auctionId -> sellerId)
 *
 * Start the backend first. Usage from repo root: npm run sim:run
 * Env: SIM_DURATION (sec, default 60), SIM_PRIMARY_AUCTIONS (default 3).
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  TruthfulAgent,
  SniperAgent,
  ShillAgent,
  CollusionAgent,
} from './agents';
import type { AuctionState } from './agents';
import type { BidLogEntry, SimRunManifest, AgentType } from './types';

const BASE = process.env.SIM_BACKEND_URL || 'http://localhost:5000/api';
const DURATION_SEC = parseInt(process.env.SIM_DURATION || '60', 10);
const PRIMARY_AUCTIONS = Math.max(2, parseInt(process.env.SIM_PRIMARY_AUCTIONS || '3', 10));
const POLL_MS = 500;
const STARTING_PRICE = 1000;
const MIN_INCREMENT = 100;

interface UserCred { userId: string; token: string; email: string; }

type AnyAgent = TruthfulAgent | SniperAgent | ShillAgent | CollusionAgent;

interface Participant {
  cred: UserCred;
  type: AgentType;
  isShill: boolean;
  agent: AnyAgent;
  partnerId?: string; // collusion only
}

interface SimAuction {
  id: string;
  sellerId: string;
  participants: Participant[];
}

async function register(email: string, password: string, name: string): Promise<UserCred> {
  const res = await axios.post(`${BASE}/auth/register`, { email, password, name });
  return { userId: res.data.user.id, token: res.data.token, email };
}

async function login(email: string, password: string): Promise<UserCred> {
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  return { userId: res.data.user.id, token: res.data.token, email };
}

async function createAuction(token: string, durationSec: number): Promise<string> {
  const endTime = new Date(Date.now() + durationSec * 1000).toISOString();
  const res = await axios.post(
    `${BASE}/auctions`,
    {
      title: `Sim Auction ${uuidv4().slice(0, 8)}`,
      description: 'Simulator-generated auction for fraud detection evaluation.',
      type: 'ENGLISH',
      startingPrice: STARTING_PRICE,
      minIncrement: MIN_INCREMENT,
      antiSnipingMins: 0,
      endTime,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.id as string;
}

async function getAuctionState(auctionId: string, token: string): Promise<AuctionState> {
  const res = await axios.get(`${BASE}/auctions/${auctionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const a = res.data;
  return {
    id: a.id,
    currentPrice: Number(a.currentPrice),
    minIncrement: Number(a.minIncrement),
    endTime: new Date(a.endTime).getTime(),
    status: a.status,
    topBidderId: a.bids?.[0]?.bidderId ?? undefined,
  };
}

async function placeBid(auctionId: string, amount: number, token: string): Promise<boolean> {
  try {
    await axios.post(
      `${BASE}/bids/auctions/${auctionId}`,
      { amount },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function runSimulation() {
  const runId = uuidv4();
  const startedAt = new Date().toISOString();
  const outDir = path.join(process.cwd(), 'packages', 'simulator', 'runs', runId);
  fs.mkdirSync(outDir, { recursive: true });
  const suffix = runId.slice(0, 8);

  console.log(`[Sim] Run ${runId} -- ${PRIMARY_AUCTIONS} primary + 1 decoy auction, ${DURATION_SEC}s`);

  // ── Sellers ────────────────────────────────────────────────────────────────
  const mkSeller = async (tag: string): Promise<UserCred> => {
    const email = `sim-${tag}-${suffix}@ah.test`;
    const pass = `Sim${tag}${suffix}!`;
    try { return await login(email, pass); } catch { /* fall through to register */ }
    return register(email, pass, `${tag}_${suffix}`);
  };
  const primarySeller = await mkSeller('seller');
  const decoySeller = await mkSeller('decoy');

  // ── Bidder personas (one user each, reused across the auctions they target) ──
  const makeCred = async (tag: string, idx: number): Promise<UserCred> => {
    const email = `sim-${tag}-${suffix}-${idx}@ah.test`;
    const pass = `Sim${tag}${suffix}!`;
    try { return await login(email, pass); } catch { /* fall through */ }
    return register(email, pass, `${tag}_${suffix}_${idx}`);
  };

  const [t1, t2, sniper, shill, colA, colB] = await Promise.all([
    makeCred('truthful', 1),
    makeCred('truthful', 2),
    makeCred('sniper', 1),
    makeCred('shill', 1),
    makeCred('col', 1),
    makeCred('col', 2),
  ]);

  // Fund every account (respecting the 100,000 single-deposit cap).
  const deposit = async (cred: UserCred) => {
    for (let i = 0; i < 5; i++) {
      try {
        await axios.post(`${BASE}/wallet/deposit`, { amount: 100000 },
          { headers: { Authorization: `Bearer ${cred.token}` } });
      } catch (err) {
        const msg = axios.isAxiosError(err) ? err.response?.data?.message ?? err.message : String(err);
        console.error(`[Sim] Deposit failed for ${cred.email}: ${msg}`);
      }
    }
  };
  await Promise.all([t1, t2, sniper, shill, colA, colB].map(deposit));

  // ── Create auctions ──────────────────────────────────────────────────────────
  const primaryIds: string[] = [];
  for (let i = 0; i < PRIMARY_AUCTIONS; i++) {
    primaryIds.push(await createAuction(primarySeller.token, DURATION_SEC));
  }
  const decoyId = await createAuction(decoySeller.token, DURATION_SEC);
  console.log(`[Sim] Created primary auctions [${primaryIds.map((x) => x.slice(0, 6)).join(', ')}] + decoy ${decoyId.slice(0, 6)}`);

  // ── Targeting: which personas bid on which auction ────────────────────────────
  // Fraud (shill, collusion) span EVERY primary auction -> high sigma.
  // Legit (truthful, sniper) touch a single primary each; a truthful bidder
  // also bids the decoy seller -> "active" but low sigma per seller.
  const auctions: SimAuction[] = [];

  primaryIds.forEach((id, i) => {
    const participants: Participant[] = [];

    // Shill: every primary auction of this seller.
    participants.push({
      cred: shill, type: 'shill', isShill: true,
      agent: new ShillAgent(STARTING_PRICE, STARTING_PRICE * 3),
    });

    // Collusion ring: both members on every primary auction (reciprocity + co-occurrence).
    participants.push({
      cred: colA, type: 'collusion', isShill: true, partnerId: colB.userId,
      agent: new CollusionAgent(STARTING_PRICE, colB.userId),
    });
    participants.push({
      cred: colB, type: 'collusion', isShill: true, partnerId: colA.userId,
      agent: new CollusionAgent(STARTING_PRICE, colA.userId),
    });

    // Truthful: t1 on the first auction, t2 on the second (one primary each).
    if (i === 0) {
      participants.push({ cred: t1, type: 'truthful', isShill: false, agent: new TruthfulAgent(STARTING_PRICE) });
    }
    if (i === 1 % PRIMARY_AUCTIONS) {
      participants.push({ cred: t2, type: 'truthful', isShill: false, agent: new TruthfulAgent(STARTING_PRICE) });
    }

    // Sniper: a single primary auction (the last one).
    if (i === PRIMARY_AUCTIONS - 1) {
      participants.push({ cred: sniper, type: 'sniper', isShill: false, agent: new SniperAgent(STARTING_PRICE) });
    }

    auctions.push({ id, sellerId: primarySeller.userId, participants });
  });

  // Decoy auction (different seller): only truthful bidders -- proves an active
  // organic bidder can appear on 2 auctions yet keep low sigma PER seller.
  auctions.push({
    id: decoyId,
    sellerId: decoySeller.userId,
    participants: [
      { cred: t1, type: 'truthful', isShill: false, agent: new TruthfulAgent(STARTING_PRICE) },
      { cred: t2, type: 'truthful', isShill: false, agent: new TruthfulAgent(STARTING_PRICE) },
    ],
  });

  // ── Manifest scaffolding ──────────────────────────────────────────────────────
  const agentMap: Record<string, { userId: string; agentType: AgentType }> = {};
  for (const a of auctions) {
    for (const p of a.participants) {
      agentMap[p.cred.userId] = { userId: p.cred.userId, agentType: p.type };
    }
  }
  const auctionOwners: Record<string, string> = {};
  for (const a of auctions) auctionOwners[a.id] = a.sellerId;

  // ── Main loop ─────────────────────────────────────────────────────────────────
  const log: BidLogEntry[] = [];
  const endMs = Date.now() + DURATION_SEC * 1000;

  while (Date.now() < endMs) {
    for (const auction of auctions) {
      let state: AuctionState;
      try {
        state = await getAuctionState(auction.id, primarySeller.token);
      } catch { continue; }
      if (state.status === 'ENDED') continue;

      for (const p of auction.participants) {
        const decision =
          p.agent instanceof CollusionAgent
            ? p.agent.decide(state, p.cred.userId, state.topBidderId)
            : (p.agent as TruthfulAgent | SniperAgent | ShillAgent).decide(state, p.cred.userId);

        if (decision.shouldBid && decision.amount !== undefined) {
          const ok = await placeBid(auction.id, decision.amount, p.cred.token);
          if (ok) {
            const entry: BidLogEntry = {
              ts: Date.now(),
              auctionId: auction.id,
              bidderId: p.cred.userId,
              amount: decision.amount,
              agentType: p.type,
              isShill: p.isShill,
            };
            log.push(entry);
            fs.appendFileSync(path.join(outDir, 'events.jsonl'), JSON.stringify(entry) + '\n');
            console.log(
              `[Sim] ${auction.id.slice(0, 6)} ${p.type.padEnd(10)} bid ${decision.amount} | price=${state.currentPrice}`
            );
          }
        }
      }
    }
    await sleep(POLL_MS);
  }

  // ── Manifest ────────────────────────────────────────────────────────────────
  const manifest: SimRunManifest = {
    runId,
    startedAt,
    endedAt: new Date().toISOString(),
    config: {
      auctionCount: auctions.length,
      agents: Object.values(agentMap).map((a) => ({ type: a.agentType, email: '', password: '' })),
      auctionDurationSec: DURATION_SEC,
      startingPrice: STARTING_PRICE,
      minIncrement: MIN_INCREMENT,
      backendUrl: BASE,
    },
    auctionIds: auctions.map((a) => a.id),
    agentMap,
    auctionOwners,
    totalBids: log.length,
    shillBids: log.filter((b) => b.isShill).length,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n[Sim] Done. ${log.length} bids (${manifest.shillBids} shill) across ${auctions.length} auctions.`);
  console.log(`[Sim] Output: ${outDir}`);
  return { runId, outDir, log };
}

runSimulation().catch((e) => {
  console.error('[Sim] Run failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
