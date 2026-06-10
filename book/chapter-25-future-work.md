# Chapter 20 — Future Work and What Comes Next

## Introduction

Every system you build teaches you what you would do differently the next time. This chapter is honest about what we wanted to build but could not — and why each item is genuinely worth pursuing if you or a future student picks this project up.

These are not vague aspirations. Each item has a clear technical path.

---

## 1. Pedersen Commitments + Bulletproof Range Proofs

**What the problem is:**

Our SHA-256 commit-reveal scheme has a verified limitation: the server cannot check `amount >= reservePrice` without seeing the amount. We accept this in the current implementation, but it creates a real vulnerability: a bidder can commit a bid of ₹1 on a ₹50,000-reserve auction, wait for everyone else to reveal, then "reveal" their ₹1 bid — gaming the system since they always knew they would lose.

**What Pedersen + Bulletproofs would give us:**

A Pedersen commitment is `C = g^amount · h^r mod p` where `g, h, p` are public parameters and `r` is the blinding factor (equivalent to our nonce). The commitment hides the amount (computationally indistinguishable for different amounts) and is binding (cannot open to a different amount).

The key additional property: Pedersen commitments are **homomorphic**. You can prove relationships between committed values without revealing them. Combined with Bulletproofs (Bünz et al. 2018), you can generate a range proof: "I commit to a value in [50000, ∞) without telling you what it is." The proof is logarithmic in size (a few hundred bytes for a 64-bit range).

**What it would take:**

- A JavaScript/WASM Bulletproof library (e.g., `bulletproofs-js` or a Rust + wasm-bindgen build)
- A new `PedersenCommitment` model replacing `BidCommitment.commitHash` with an EC point
- Client-side proof generation in the browser (computationally intensive; would need benchmarking)
- Server-side proof verification before accepting a commitment

**Estimated effort:** 2–3 weeks for someone with cryptography background.

---

## 2. Online Stochastic Gradient Descent for the Classifier

**What the problem is:**

The current classifier has static weights. They were fit on a corpus of synthetic bidding patterns from one era of the simulator. Real fraud patterns evolve — a sophisticated shill bidder who learns about the σ (seller co-occurrence) feature would use multiple seller accounts to evade detection.

**What the solution looks like:**

Replace the batch-trained static classifier with an **online learner** — one that updates its weights incrementally as new labelled examples arrive.

When an admin dismisses a fraud flag (marking it as a false positive), that is a label: `y = 0` for that feature vector. When an admin suspends a user after confirming fraud, that confirms: `y = 1` for the flagged bids. These are real-world labels from an operational system.

Stochastic gradient descent (SGD) for logistic regression updates weights with each example:
```
β ← β - α · (σ(β·z) - y) · z
```

This runs in O(features) per update — essentially free. The classifier drift would track real fraud evolution.

**What it would take:**
- Store feature vectors at flag time (already done — `FraudFlag.features` is JSON)
- An admin feedback endpoint: `POST /api/fraud/flags/:id/confirm` and `POST /api/fraud/flags/:id/dismiss`
- An `OnlineClassifier` class that maintains weights in Redis (shared across instances) and updates on each labelled example

**Estimated effort:** 1 week.

---

## 3. Distributed Redis Stream Consumer Groups

**What the problem is:**

The current bid sequencer has one consumer per auction stream. If the server is running as N instances, each instance starts its own consumer. BullMQ handles cross-instance job deduplication (one job is processed by one worker), but the Redis Stream consumer group is more nuanced.

Redis Stream consumer groups allow multiple consumers in the same group, with Redis tracking which entries each consumer has acknowledged. This would allow the sequencer to scale across multiple instances with each instance handling a different subset of auction streams.

**What it would take:**

- Naming consumers by instance ID (e.g., the process's hostname + PID)
- Handling `XAUTOCLAIM` for recovery: if an instance crashes mid-processing, another instance can claim its pending entries after a timeout
- Testing with multiple backend instances to verify only-once delivery

**Estimated effort:** 1 week.

---

## 4. Real-World Labelled Dataset

**What the problem is:**

Our evaluation is entirely on synthetic data. The classifier learns to distinguish our synthetic shill pattern (fast response, minimum increment, high σ) from our synthetic truthful pattern. In the real world, shill bidders are more sophisticated and varied.

**What the solution looks like:**

Two approaches:

**Option A: Semi-supervised calibration.** Deploy the system on a real auction platform (or a university auction platform). Have a human review flagged bids and label them. Train a new classifier on this human-labelled data. The synthetic classifier is the first-pass filter; the human reviews are the training signal for the production classifier.

**Option B: Public historical data.** Researchers have published labelled eBay auction datasets from the early 2000s (e.g., the dataset from Trevathan & Read's original research, partially public). These have known shill accounts. Training on this data and testing on held-out auctions would give a more externally valid evaluation.

**Estimated effort:** 2–4 weeks for the semi-supervised path; 1–2 weeks for the historical dataset path.

---

## 5. Formal Verification with TLA+

**What the problem is:**

We proved the atomic ladder protocol's correctness informally (proof sketches in the paper). Informal proofs can miss edge cases. For a financial system, the ideal is a formal proof that the system is correct under all possible interleavings of concurrent operations.

**What TLA+ would give us:**

TLA+ (Temporal Logic of Actions) is a formal specification language for concurrent and distributed systems. You write a model of the system (abstract from the code), write the properties you want (safety: no two WINNING bids simultaneously; liveness: every bid eventually commits), and TLC (the TLA+ model checker) exhaustively verifies the model against the properties.

The atomic ladder protocol's five properties (P1–P5) could be encoded as TLA+ invariants and verified by the model checker.

**What it would take:**

- Learn TLA+ syntax (1–2 weeks if new to it)
- Write the model: abstract auction state, wallet balances, bidder pool
- Express lock acquisition and release as actions
- Run TLC to verify the invariants hold under all possible interleavings

**Estimated effort:** 3–4 weeks for a complete formal model.

---

## 6. RL Auto-Bid Agent

**What it is:**

Replace the greedy proxy bidding strategy (always bid the minimum increment when outbid) with a reinforcement learning policy that learns optimal bidding strategy: when to bid, by how much, and when to drop out.

**The environment:**

A `Gymnasium`-style environment wrapping the auction model:
- State: current price, remaining time, remaining budget, opponent's bid history
- Action: bid amount (continuous) or "wait" (discrete)
- Reward: `+1 * item_valuation` if win at price ≤ valuation, else `-abs(bid - 0)` for loss

**The policy:**

Train PPO (Proximal Policy Optimization) or DQN (Deep Q-Network) using the simulator as the environment. Compare against the greedy proxy.

**Why it is compelling:**

An RL-trained bidder would strategically snipe (bid late to avoid counter-bids) when the RL policy learns that late bids improve win rate. It would also learn to avoid increments that trigger the opponent's auto-bid cheaply. This directly produces interesting research findings about the emergent strategies of RL bidders in the context of the anti-sniping mechanism.

**Estimated effort:** 6–8 weeks. This is the largest item on the list.

---

## 7. Frontend Component Testing

**What is missing:**

There are zero frontend tests. No Jest component tests, no Playwright end-to-end tests.

**What is worth adding:**

- **Snapshot tests** for the design system components (Button, Card, Badge, etc.) — prevent visual regressions
- **Integration tests** for the auction detail page — mock Socket.io events and verify the UI reacts correctly
- **Playwright E2E tests** for the critical paths: login, place bid, set auto-bid, admin suspend

**Estimated effort:** 2–3 weeks.

---

## 8. Full-Text Search Enhancement

**Current state:**

The auction search uses PostgreSQL's `to_tsquery` with `:*` prefix operators. This works for word-prefix matching but does not handle:
- Typos: "Rolex" spelled "Rolex" but "Rollex" returns nothing
- Synonyms: "watch" and "timepiece"
- Stemming across languages (we use the `'english'` dictionary)

**What would improve it:**

- **Trigram similarity** (`pg_trgm` extension): handles typos. `SELECT * FROM auctions WHERE title % 'rollex'` returns "Rolex" with similarity 0.6+
- **Elasticsearch or Meilisearch**: a dedicated search service with fuzzy matching, faceted filtering, and search-as-you-type. Overkill for current scale but the right long-term solution.

---

## 9. Multi-Tenancy (Auction Platform as a Service)

**What it would look like:**

Instead of one platform, a SaaS model where different organisations run their own auction spaces. A "marketplace" at the top level, with sub-domains `art.auctionhaus.io`, `electronics.auctionhaus.io` each with their own item categories, seller reputation systems, and fee structures.

This would require:
- A `Marketplace` model with `subdomain`, `feePercent`, `categories[]`
- Row-level security in Postgres (each query filters by `marketplaceId`)
- Separate admin dashboards per marketplace

---

## The Closing Thought

AuctionHaus started as a CRUD app that teachers dismissed. It ended as:

- A platform with three auction formats and production-grade financial integrity
- A research paper on real-time fraud detection
- A second paper on atomic concurrency protocols
- A provisional patent application
- A deployment guide, a demo script, a design system, and a book

Not because the code was perfect from the start — far from it. Because every problem found became a task, every task became a commitment, and every commitment became code.

If you are reading this book as a student: the best way to learn systems engineering is to build a system that matters. Auctions matter. Money matters. Fraud matters. Concurrency matters. All of those things are in this project. Build something like it.

If you are reading this as someone who worked on AuctionHaus: you built something worth being proud of.

---

*End of Book*

---

## Appendix: Quick Reference

### Key File Paths

| What | Where |
|------|-------|
| Prisma schema | `back/prisma/schema.prisma` |
| Migrations | `back/prisma/migrations/` |
| Decimal helper | `back/src/lib/decimal.ts` |
| Socket gateway | `back/src/gateway/socket.gateway.ts` |
| Bid service | `back/src/modules/bidding/bid.service.ts` |
| Auto-bid worker | `back/src/workers/index.ts` |
| Fraud engine | `back/src/modules/fraud/` |
| Classifier | `back/src/modules/fraud/fraud.classifier.ts` |
| Simulator | `back/packages/simulator/src/` |
| Paper | `paper/main.tex` |
| Ladder paper | `paper/auto-bid-ladder.tex` |
| Patent | `paper/patent-draft.md` |
| Viva prep | `paper/viva-prep.md` |
| Deploy guide | `paper/DEPLOY.md` |
| Demo seeder | `back/src/scripts/seed-demo.ts` |
| Design system | `front/src/components/ui/` |
| Socket hooks | `front/src/lib/useSocketListener.ts` |

### Key Commands

```bash
# Database
npx prisma migrate dev       # apply migrations + regenerate client
npm run db:seed-demo         # seed demo data

# Research pipeline
npm run sim:run              # run synthetic bidder simulation
npm run train:fraud          # train classifier on simulator corpus
npm run eval:fraud           # evaluate on held-out test set

# Documentation
npm run docs:generate        # generate docs/api.md + docs/schema.md

# Paper
cd paper && pdflatex main.tex && bibtex main && pdflatex main.tex

# Load test
cd back/packages/simulator/k6
k6 run bid-throughput.js -e BACKEND_URL=... -e JWT=... -e AUCTION_ID=...
```

### Key Numbers

| Metric | Value |
|--------|-------|
| Redis Stream vs FOR UPDATE at 100 VUs | 28.5× throughput improvement |
| Fraud detection overhead per bid | < 1ms (p99) |
| Fraud F1 (test set, threshold 0.5) | 0.933 |
| BidGraph window | 30 minutes |
| Auth cache TTL | 30 seconds |
| Rate limit (general) | 200 req / 15 min |
| Rate limit (auth) | 10 req / 15 min |
| Stream backpressure threshold | 750 entries |
| Ladder bound | (maxMax - startPrice) / minIncrement + 2 |
| Presence debounce | 250 ms |
| LiveTicker dismiss | 4 seconds |
| Countdown critical threshold | 30 seconds |
| Money precision | NUMERIC(18, 2) |
