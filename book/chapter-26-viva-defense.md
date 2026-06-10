# Chapter 22 — The Viva Defense Guide

## How to Use This Chapter

Your project presentation or viva is not just "here is what I built." It is a test of whether you understand WHY every decision was made. Examiners probe the reasoning behind choices, not just the outcomes.

This chapter gives you scripted 60-second answers to every question a CS professor is likely to ask, plus the deeper answers for when they push further. Practise these until you can deliver them without notes.

---

## The Three Core Questions

These three questions will almost certainly be asked. Master them first.

---

### Q1: "Why did you use Decimal and not Float for money?"

**60-second answer:**

IEEE-754 double-precision floats cannot represent most decimal fractions exactly. In JavaScript, `0.1 + 0.2` equals `0.30000000000000004` — not `0.3`. For a single operation that is invisible, but across hundreds of bid-hold and bid-release operations the error accumulates. In an escrow system where you hold money and then release it, a ₹0.01 rounding error on every transaction means users' wallets slowly drift away from their true balance. That is both a financial bug and an audit failure — your ledger no longer reconciles.

The fix is `NUMERIC(18,2)` in Postgres — a fixed-point type that stores exact decimal values. Prisma maps it to a `Decimal` object in TypeScript (backed by `decimal.js`). We do all arithmetic with Decimal methods: `.add()`, `.sub()`, `.lt()`. At the API boundary we convert to a plain JavaScript number for the frontend, which only needs display precision. The key design principle: exact at the write path, approximate only at the read-for-display path.

**If the examiner pushes: "But surely the amounts are always integers — just use cents?"**

Yes, storing in paisa (integers) is another valid approach and avoids the issue entirely. We chose NUMERIC(18,2) because it is the standard bank-grade SQL type, Prisma has first-class support for it, and it keeps the API in rupees (₹50,000 rather than 5000000 paisa) which is more readable. The cryptographic commitment protocol actually does use paisa integers for the hash input precisely to avoid any decimal formatting ambiguity.

---

### Q2: "What race condition did you fix, and how?"

**60-second answer:**

The race is a classic check-then-act: two bidders submit bids simultaneously. Both read the same `currentPrice` (say ₹10,000). Both check "is my amount (₹15,000) ≥ currentPrice + minIncrement (₹11,000)?" Both pass. Both commit. Now you have two WINNING bids at different amounts, and the auction has two apparent winners. Worse, both bidders' wallets have had money held.

The fix is Postgres pessimistic row locking. Before any validation, we execute `SELECT id FROM auctions WHERE id = ? FOR UPDATE`. This acquires an exclusive lock on that row. The second concurrent request blocks at the database level, waiting for the first transaction to commit. When the first commits, the second re-reads `currentPrice` (now ₹15,000), checks "is ₹15,000 ≥ ₹15,000 + ₹1,000 = ₹16,000?" — this fails — and returns 400.

To prevent deadlocks when multiple rows must be locked in the same transaction (auction + buyer wallet + previous winner wallet), we enforce a global lock order: auction row first, then wallets in ascending userId order. As long as every code path follows this order, you cannot form a circular wait.

**If the examiner asks: "What is READ COMMITTED and why is it not enough?"**

READ COMMITTED is Postgres's default isolation level. It means each statement sees only committed data, but it does NOT mean two statements in the same transaction see consistent snapshots. Two `findUnique` calls in sequence can return different values if another transaction commits between them. A plain `findUnique` on the auction row in Transaction A does not prevent Transaction B from modifying the auction before Transaction A commits. `FOR UPDATE` is the explicit lock that fills this gap.

---

### Q3: "What is the novelty of your fraud detection versus prior work?"

**60-second answer:**

Every prior published shill-bidding detection system we found in the literature shares one fundamental limitation: it operates post-hoc. Trevathan and Read 2007 compute a shill score from complete auction histories. Ford et al. 2010 build bidder-seller co-occurrence graphs after each auction closes. Tsang et al. 2014 run community detection on transaction dumps after the fact. By the time any of these systems raises a flag, the auction is over, the seller has been paid, and the damage is done.

Our system processes every bid in real time, in under a millisecond, during a live auction. We maintain a 30-minute sliding-window bid graph in memory. For each bid we extract five features: response time (sub-500ms = likely automated), bid frequency, increment ratio (always minimum = scripted), seller co-occurrence (shill bids at same seller's auctions), and reciprocity (mutual outbidding = collusion). A logistic regression classifier scores the combination and emits a `fraud:flag` event to the admin dashboard before the auction closes. The administrator can void the bid or suspend the user while bidding is still open. That real-time intervention is the defensible contribution.

**If the examiner asks: "Why logistic regression and not XGBoost or a neural network?"**

Three reasons. First, LR has no external dependencies and runs in-process — there is no Python sidecar, no ONNX model file, no IPC latency. The entire check happens in under 1ms in the same Node.js process as the bid handler. Second, LR is interpretable: the weights tell you directly which features matter (σ has weight 2.5, far larger than any other feature). Third, our corpus is 70+ training examples — too small to meaningfully outperform LR with more complex models. On a small corpus, LR's bias-variance tradeoff is better than XGBoost. With a real-world dataset of thousands of labelled auctions, we would revisit.

---

## Additional Deep Questions

These are less certain but plausible:

---

### Q4: "What is the auto-bid atomic ladder protocol? Why is it 'atomic'?"

**Answer:**

Standard proxy bidding implementations do one of two things: a closed-form jump (compute the final price in one step, create one bid — fast but produces no intermediate bid records) or a recursive nested transaction (call `placeBid` inside another `placeBid` transaction — deadlocks under load in Prisma, not durable).

Our implementation uses a BullMQ queue. When a manual bid commits, we enqueue `process-ladder`. A worker picks up the job and runs the entire ladder — every increment from current price to the equilibrium — in a single Postgres transaction. Every increment writes its own Bid row. The entire multi-step ladder is atomic: either all increments commit, or none do.

"Atomic" means two things here: (1) all-or-nothing — a crash midway rolls back all partial increments; (2) isolated — a concurrent manual bid that arrives while the ladder is running sees the auction only before or after the ladder, never mid-ladder.

The per-increment logging satisfies the UX contract (users see every step in the bid history) and the research contract (the fraud engine needs response times between consecutive bids, which require per-step records).

---

### Q5: "What does the SHA-256 commitment scheme actually guarantee?"

**Answer:**

Two properties. **Hiding:** the commitment `H = SHA-256(amountHex + ":" + nonce)` reveals nothing about the amount because SHA-256 behaves as a pseudorandom function — given `H`, you cannot determine `amount` without also knowing the nonce (which is a randomly generated 32-byte value, 2^256 possibilities). **Binding:** the bidder cannot change their amount after submitting the commitment because SHA-256 is collision-resistant — it is computationally infeasible to find two different `(amount, nonce)` pairs that produce the same hash.

What it does NOT guarantee: range proofs. The server cannot verify `amount >= reservePrice` without learning the amount. A bidder can commit to ₹0 and never reveal, or reveal a valid ₹0 commitment, gaming the sealed-bid outcome. The proper fix is Pedersen commitments plus Bulletproof range proofs, which allow proving `amount ∈ [reservePrice, MAX]` without revealing the amount.

---

### Q6: "Why did you use Redis Streams instead of just using a database queue?"

**Answer:**

The fundamental bottleneck with direct database bidding under high concurrency is lock contention. At 100 concurrent bidders, all 100 try to `SELECT FOR UPDATE` the same auction row. Only one holds the lock at a time; the other 99 are queued in Postgres's lock manager. Each transaction is short (5-10ms) but the serialisation means effective throughput is only 27.7 bids/s.

A Redis Stream makes the queue explicit. The clients do `XADD auction:{id}:bids * { bidderId, amount }` — this is an O(1) append with no contention, returning immediately. A single consumer reads from the stream serially: `XREADGROUP`. The Postgres transaction inside the consumer is now uncontested (only one at a time). No lock wait. Result: 788.6 bids/s at 100 VUs, a 28.5× improvement.

A database queue (like a `job_queue` table in Postgres) would still serialize through Postgres locking. Redis is an in-memory data structure store optimized for this exact pattern — sequential append, FIFO pop.

---

### Q7: "What happens if the BullMQ worker crashes mid-auto-bid-ladder?"

**Answer:**

BullMQ has at-least-once delivery with configurable retry. If the worker crashes, after `stalledInterval` (5 minutes in our config), BullMQ marks the job as stalled and re-queues it for retry.

When the worker retries, it runs the ladder transaction again. The ladder starts by locking the auction row and loading the current state. If the previous run partially committed — impossible, because the entire ladder is one transaction — nothing partial exists. If it crashed before committing, Postgres rolled back everything automatically. The retry starts from scratch: current price, current pool, correct state.

This is the advantage of putting the entire ladder in one transaction: the "resume from where we left off" problem does not exist. Either the ladder committed (auction price advanced, bid rows created) or it did not (same state as before). The retry always operates on consistent state.

---

### Q8: "How do you prevent a user from setting an auto-bid they can't afford?"

**Answer:**

Phase E2 added a pre-flight check in `setAutoBid`: `wallet.balance - wallet.heldAmount >= maxAmount`. This is checked at registration time. If the user's available balance (not held by other bids) is less than their proposed auto-bid maximum, the system rejects with a specific error message: "Need ₹X, have ₹Y available."

This is "fail fast" — catching the error before the auto-bid is ever registered, rather than silently deactivating the auto-bid during the ladder when insufficient funds are discovered. Users get immediate feedback instead of discovering later that their auto-bid never fired.

The affordability is re-checked inside the ladder transaction too (the wallet lock guarantees the check is consistent with the actual balance). Pre-flight is a UX improvement; the in-transaction check is the correctness guarantee.

---

### Q9: "Is your system production-ready?"

**Honest answer:**

For a college major project, it is in excellent shape. For a real financial platform handling real money, several things would need to change:

1. **Real payment processor**: the wallet deposit/withdraw system is a mock. Production would require Stripe, Razorpay, or similar.
2. **Fraud model on real data**: the classifier was trained on synthetic data. Real shill bids are more sophisticated. Semi-supervised calibration with admin feedback (Phase E2 in the roadmap) would be needed.
3. **Frontend tests**: there are no UI tests. Component tests and Playwright E2E tests are missing.
4. **Distributed fraud engine**: the BidGraph is per-process. Multi-instance deployments would need a shared graph store.
5. **Formal security audit**: the authentication, rate limiting, and input validation are solid student-grade, but a production system would get a professional pen test.
6. **Pedersen commitments**: the sealed-bid protocol cannot verify reserve prices. Range proofs are future work.

None of these disqualify the project as a major project. All of them are explicit in the paper's limitations section.

---

### Q10: "If you were to rebuild this, what would you do differently?"

**Honest answer:**

Three things.

First, use integers (paisa) for all money storage instead of NUMERIC(18,2). It avoids the Decimal vs number boundary conversion entirely and makes the ledger reconciliation unambiguous.

Second, separate the fraud engine into its own process from the start. Having it in-process with the bid handler simplifies the demo but means the fraud graph state is not shared across instances. A separate fraud microservice with a shared Redis graph would be more scalable.

Third, write the tests before the features. The concurrency tests (verifying that concurrent bids cannot produce two WINNING rows) require a real database. The unit tests with mocked Prisma are valuable but do not catch the concurrency bugs. Integration tests running against a real Postgres instance should be the minimum bar for any code that touches money.

---

## The 30-Second "Elevator Pitch" for the Whole Project

If a professor asks you to summarise the project in 30 seconds:

> AuctionHaus is a real-time auction platform with three auction formats. The distinguishing features are: (1) a real-time shill-bidding detector that scores every bid in under a millisecond using a streaming bid graph and logistic regression — all prior work is post-hoc; (2) an atomic proxy-bid ladder that writes every increment as its own database row in one transaction, provably correct under concurrent load; (3) SHA-256 cryptographic commitments for sealed-bid auctions; and (4) a Redis Stream bid sequencer that is 28.5 times faster than direct Postgres row locking at 100 concurrent bidders. The system fixes all the financial correctness issues (float money, race conditions, non-idempotent settlement) that most student auction projects have. There are two IEEE-format papers and a provisional patent application.

---

## Next Chapter

Chapter 23 is the documentation-reality gap — the story of `bible.md` and `done.md`, how aspirational documentation becomes technical debt, and what the original audit found.
