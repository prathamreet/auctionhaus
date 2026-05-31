/**
 * Phase C1 — Synthetic Bidder Simulator
 *
 * Creates auctions, registers synthetic bidder accounts, runs each persona
 * against each auction, and writes:
 *   runs/{runId}/events.jsonl   — every bid decision (ground-truth labelled)
 *   runs/{runId}/manifest.json  — metadata for the eval harness
 *
 * Usage:
 *   npx ts-node packages/simulator/src/run.ts [--runs 10] [--duration 60]
 *
 * The sim talks to the live backend — start the server first.
 * ADMIN credentials must be set in env: SIM_ADMIN_EMAIL, SIM_ADMIN_PASSWORD
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
import type { BidLogEntry, SimRunManifest, AgentType } from './types';

const BASE = process.env.SIM_BACKEND_URL || 'http://localhost:5000/api';
const DURATION_SEC = parseInt(process.argv[3] || process.env.SIM_DURATION || '60', 10);
const POLL_MS = 500;

interface UserCred { userId: string; token: string; email: string; }

async function register(email: string, password: string, name: string): Promise<UserCred> {
  const res = await axios.post(`${BASE}/auth/register`, { email, password, name });
  return { userId: res.data.user.id, token: res.data.token, email };
}

async function login(email: string, password: string): Promise<UserCred> {
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  return { userId: res.data.user.id, token: res.data.token, email };
}

async function createAuction(token: string, startingPrice: number, durationSec: number): Promise<string> {
  const endTime = new Date(Date.now() + durationSec * 1000).toISOString();
  const res = await axios.post(
    `${BASE}/auctions`,
    {
      title: `Sim Auction ${uuidv4().slice(0, 8)}`,
      description: 'Simulator-generated auction for fraud detection evaluation.',
      type: 'ENGLISH',
      startingPrice,
      minIncrement: 100,
      antiSnipingMins: 0,
      endTime,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.id as string;
}

async function getAuctionState(auctionId: string, token: string) {
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
    topBidderId: a.bids?.[0]?.bidderId ?? null,
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
  } catch { return false; }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function runSimulation() {
  const runId = uuidv4();
  const startedAt = new Date().toISOString();
  const outDir = path.join(process.cwd(), 'packages', 'simulator', 'runs', runId);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[Sim] Run ${runId} started — duration ${DURATION_SEC}s`);

  // ── Register agents ──────────────────────────────────────────────────────
  const suffix = runId.slice(0, 8);
  const adminEmail = process.env.SIM_ADMIN_EMAIL || `sim-admin-${suffix}@ah.test`;
  const adminPass = process.env.SIM_ADMIN_PASSWORD || `SimAdmin${suffix}!`;

  let admin: UserCred;
  try {
    admin = await login(adminEmail, adminPass);
  } catch {
    admin = await register(adminEmail, adminPass, `SimAdmin${suffix}`);
  }

  const makeCred = async (tag: string, idx: number): Promise<UserCred> => {
    const email = `sim-${tag}-${suffix}-${idx}@ah.test`;
    const pass = `Sim${tag}${suffix}!`;
    try { return await login(email, pass); } catch {}
    return register(email, pass, `${tag.charAt(0).toUpperCase()}${tag.slice(1)}_${suffix}_${idx}`);
  };

  const [t1, t2, sniper, shill, colA, colB] = await Promise.all([
    makeCred('truthful', 1),
    makeCred('truthful', 2),
    makeCred('sniper', 1),
    makeCred('shill', 1),
    makeCred('col', 1),
    makeCred('col', 2),
  ]);

  // Also deposit wallet funds for each bidder (respecting the ₹100,000 single deposit limit)
  const deposit = async (cred: UserCred) => {
    for (let i = 0; i < 5; i++) {
      try {
        await axios.post(`${BASE}/wallet/deposit`, { amount: 100000 },
          { headers: { Authorization: `Bearer ${cred.token}` } });
      } catch (err: any) {
        console.error(`[Sim] Deposit failed for ${cred.email}:`, err.response?.data?.message || err.message);
      }
    }
  };
  await Promise.all([t1, t2, sniper, shill, colA, colB].map(deposit));

  // ── Create auction ───────────────────────────────────────────────────────
  const startingPrice = 1000;
  const auctionId = await createAuction(admin.token, startingPrice, DURATION_SEC);
  console.log(`[Sim] Auction ${auctionId} created`);

  // ── Build agents ─────────────────────────────────────────────────────────
  const agents: Array<{
    cred: UserCred;
    type: AgentType;
    isShill: boolean;
    agent: TruthfulAgent | SniperAgent | ShillAgent | CollusionAgent;
  }> = [
    { cred: t1,    type: 'truthful',  isShill: false, agent: new TruthfulAgent(startingPrice) },
    { cred: t2,    type: 'truthful',  isShill: false, agent: new TruthfulAgent(startingPrice) },
    { cred: sniper, type: 'sniper',   isShill: false, agent: new SniperAgent(startingPrice) },
    { cred: shill,  type: 'shill',    isShill: true,  agent: new ShillAgent(startingPrice, startingPrice * 3) },
    { cred: colA,   type: 'collusion',isShill: true,  agent: new CollusionAgent(startingPrice, colB.userId) },
    { cred: colB,   type: 'collusion',isShill: true,  agent: new CollusionAgent(startingPrice, colA.userId) },
  ];

  const log: BidLogEntry[] = [];
  const agentMap: Record<string, { userId: string; agentType: AgentType }> = {};
  for (const a of agents) {
    agentMap[a.cred.userId] = { userId: a.cred.userId, agentType: a.type };
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  const endMs = Date.now() + DURATION_SEC * 1000;
  while (Date.now() < endMs) {
    let state;
    try {
      state = await getAuctionState(auctionId, admin.token);
    } catch { await sleep(POLL_MS); continue; }
    if (state.status === 'ENDED') break;

    for (const ag of agents) {
      let decision;
      if (ag.agent instanceof CollusionAgent) {
        decision = (ag.agent as CollusionAgent).decide(state, ag.cred.userId, state.topBidderId ?? undefined);
      } else {
        decision = (ag.agent as any).decide(state, ag.cred.userId);
      }

      if (decision.shouldBid && decision.amount !== undefined) {
        const ok = await placeBid(auctionId, decision.amount, ag.cred.token);
        if (ok) {
          const entry: BidLogEntry = {
            ts: Date.now(),
            auctionId,
            bidderId: ag.cred.userId,
            amount: decision.amount,
            agentType: ag.type,
            isShill: ag.isShill,
          };
          log.push(entry);
          fs.appendFileSync(path.join(outDir, 'events.jsonl'), JSON.stringify(entry) + '\n');
          console.log(`[Sim] ${ag.type.padEnd(12)} bid ₹${decision.amount.toLocaleString()} | price=₹${state.currentPrice.toLocaleString()}`);
        }
      }
    }
    await sleep(POLL_MS);
  }

  // ── Write manifest ────────────────────────────────────────────────────────
  const manifest: SimRunManifest = {
    runId,
    startedAt,
    endedAt: new Date().toISOString(),
    config: {
      auctionCount: 1,
      agents: agents.map((a) => ({ type: a.type, email: a.cred.email, password: '' })),
      auctionDurationSec: DURATION_SEC,
      startingPrice,
      minIncrement: 100,
      backendUrl: BASE,
    },
    auctionIds: [auctionId],
    agentMap,
    totalBids: log.length,
    shillBids: log.filter((b) => b.isShill).length,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n[Sim] Done. ${log.length} bids (${manifest.shillBids} shill).`);
  console.log(`[Sim] Output: ${outDir}`);
  return { runId, outDir, log };
}

runSimulation().catch(console.error);
