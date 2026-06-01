# AuctionHaus — Viva Preparation

> Three questions the examiner will almost certainly ask. Each answer is under
> 60 seconds when spoken at a natural pace (~130 words/min). Practise until you
> can deliver them cold.

---

## Q1. "Why Decimal and not Float for money?"

**60-second answer:**

IEEE-754 double-precision floats cannot represent most decimal fractions exactly.
0.1 + 0.2 equals 0.30000000000000004 in JavaScript. For a single bid that's
invisible, but across hundreds of bid-hold and bid-release operations the error
accumulates. In an escrow system this means the platform could lose or gain
fractional rupees on every auction, which is both a financial bug and an audit
failure.

The fix was to switch every money column to `NUMERIC(18,2)` in Postgres —
which stores exact fixed-point values — and to handle all arithmetic in the
service layer using Prisma's `Decimal` type, which wraps the `decimal.js`
library. At the API boundary we convert back to a JavaScript number for the
frontend, which only needs display precision. The key insight is: exact
arithmetic at the write path, approximate at the read path for display.

---

## Q2. "What race condition did you fix, and how?"

**60-second answer:**

The race is a classic check-then-act: two bidders concurrently read the same
`currentPrice`, both pass the minimum-increment validation, and both commit —
producing two "winning" bids at the same price, or worse, an auction where the
declared winner bid less than the second bidder.

The fix uses Postgres pessimistic row locking. Before any validation inside the
transaction we execute `SELECT id FROM auctions WHERE id = ? FOR UPDATE`. This
means the second concurrent request blocks at the database level until the first
transaction commits, at which point it re-reads the updated `currentPrice` and
correctly fails validation if it's now too low.

To prevent deadlocks when multiple rows are locked in the same transaction — for
example, when the auction row and two wallet rows must all be locked — we
enforce a global lock order: auction first, then wallets in ascending `userId`.
As long as every code path follows this order, circular waits are impossible.

---

## Q3. "What's the novelty of your fraud detection versus prior work?"

**60-second answer:**

Prior published detection systems — Trevathan and Read 2007, Ford et al. 2010,
Tsang et al. 2014 — all share one fundamental limitation: they operate
post-hoc. They collect bid histories from completed auctions and run their
classifiers offline. By the time a flag is raised, the auction is over, the
seller has been paid, and the shill bidder has already inflated the price.

Our system operates in real time, during live auctions. Every bid event is
processed in under a millisecond by an in-process engine that maintains a
30-minute sliding-window bid graph and extracts five features: response time,
bid frequency, increment ratio, seller co-occurrence, and reciprocity score.
A logistic regression classifier scores the result and emits a `fraud:flag`
event to the admin dashboard before the auction closes. The administrator can
void the bid or suspend the bidder while the auction is still live. That's the
defensible delta: real-time intervention, not post-hoc detection.

In our evaluation on synthetic data with four agent personas — truthful, sniper,
shill, and collusion ring — the classifier achieves F1 = 0.83 compared to
F1 = 0.51 for the baseline outbid-count heuristic.

---

## Additional Questions (prepare brief answers)

**"Why not use XGBoost / LightGBM instead of logistic regression?"**
LR is interpretable, has no external dependencies, runs in < 1ms in-process,
and achieves competitive F1 on our evaluation corpus. XGBoost would require a
Python sidecar (IPC latency), model serialisation infrastructure, and a larger
training corpus to show a meaningful gain. The architecture section explicitly
notes this as a future extension once a real-world labelled dataset is available.

**"What are the limitations of your synthetic evaluation?"**
Three: (1) Agent behaviour is idealised — real shills randomise timing and
increment size to evade simple heuristics. (2) The weights are hand-tuned from
a small corpus; a larger held-out set would tighten the calibration. (3) We
evaluate on one auction at a time; production deployments have thousands of
concurrent auctions and the sliding window would contain many more legitimate
bidders, increasing the false positive rate.

**"What does the commit-reveal protocol guarantee?"**
Hiding (the server learns nothing about bid amounts during the live phase —
it stores only a SHA-256 hash) and binding (the bidder cannot change their
amount after committing without breaking the hash). What it does not guarantee:
range proofs. The server cannot verify `amount >= reservePrice` without
learning the amount. Pedersen commitments with Bulletproof range proofs would
fix this at a significant computational cost — noted as future work.

**"What is the Redis Stream sequencer and why does it help?"**
It moves serialisation of bids from Postgres row locks to Redis. Under high
concurrency the Postgres row lock on the auction row becomes a bottleneck: all
concurrent bidders queue in the Postgres lock manager. The Redis Stream gives
each auction its own FIFO queue — bids are enqueued in < 1ms, and a single
consumer applies them to Postgres one at a time so the lock is always
uncontested. The result is 10× lower p99 latency at 100 concurrent bidders
(1100ms → 110ms), shown in Table III of the paper.
