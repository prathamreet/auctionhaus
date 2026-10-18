# Open Items: ICDDS 2026 Paper Refinements

This document tracks all actionable feedback, technical gaps, and required revisions identified from the peer reviews for Paper ID 1255: **"Atomic Ladder Execution: A Serializable Protocol for Concurrent Proxy Bidding in Real-Time Auction Platforms"** ([auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)).

Original reviews are recorded in [reviewer-review.md](file:///e:/project/auctionhaus/paper-refinements/reviewer-review.md) and [reviewer-remarks.md](file:///e:/project/auctionhaus/paper-refinements/reviewer-remarks.md).

---

## Executive Summary & Decision Matrix

| ID | Item | Source | Validity | Priority | Estimated Effort | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **ITEM-01** | Fix Proxy Pool Filter Bug (Algorithm 1 & Backend Worker) | Reviewer #3 | Valid | P0 (Critical) | 1.5 – 2.0 h | Open |
| **ITEM-02** | Rewrite Pricing Proof (Theorem 2: Vickrey Equivalence) | Reviewer #3 | Valid | P0 (Critical) | 2.0 – 3.0 h | Open |
| **ITEM-03** | Reconcile Wallet Accounting Model (Paper & Code) | Reviewer #3 | Valid | P0 (Critical) | 1.5 – 2.0 h | Open |
| **ITEM-04** | Correct Iteration Bound Formula & Complexity (P5) | Reviewer #3 | Valid | P0 (Critical) | 0.75 – 1.0 h | Open |
| **ITEM-05** | Benchmark Completion Criteria (Sync Commit vs Async Enqueue) | Reviewer #3 | Valid | P1 (High) | 1.0 – 1.5 h | Open |
| **ITEM-06** | Reproducibility Script & Table I Math Discrepancy | Reviewer #3 | Valid | P1 (High) | 0.5 – 0.75 h | Open |
| **ITEM-07** | Sharpen Novelty & Contribution Narrative | Reviewer #3 | Valid | P1 (High) | 1.5 – 2.0 h | Open |
| **ITEM-08** | Multi-Node Distributed Architecture Section | Reviewers #4, #5 | Valid | P2 (Medium) | 1.5 – 2.0 h | Open |

**Total Estimated Effort:** **~10 – 14 hours**

---

## Detailed Item Breakdown

### ITEM-01: Fix Proxy Pool Filter Bug

* **Reviewer Remark:** *"Algorithm 1 permanently removes the current winning proxy, potentially producing an incorrect winner and price."*
* **Validity:** Valid.
* **Problem Analysis:**
  * In [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L372) (Algorithm 1, line 372):
    ```latex
    \State drop from P any \alpha_i with M_i < next or u_i = winner
    ```
  * In [processAutoBidLadder](file:///e:/project/auctionhaus/back/src/workers/index.ts#L503-L505):
    ```typescript
    pool = pool.filter(
      (ab) => D(ab.maxAmount).gte(nextBid) && ab.bidderId !== curWinnerUserId,
    );
    ```
  * When proxy $A$ places a winning bid, it is filtered out of `pool`. If proxy $B$ subsequently outbids $A$, $A$ cannot counter-bid because $A$ was permanently dropped from `pool`. Next, $B$ is also excluded, making `pool` empty. The ladder halts prematurely at a sub-optimal price.
* **What Needs to Be Done:**
  * Update [processAutoBidLadder](file:///e:/project/auctionhaus/back/src/workers/index.ts#L503) so the current winner is temporarily bypassed when picking the next challenger (`ab.bidderId !== curWinnerUserId`), without reassigning and permanently dropping them from the candidate pool.
  * Update Algorithm 1 in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L371-L376) to reflect non-destructive candidate selection.
  * Add unit tests in [index.test.ts](file:///e:/project/auctionhaus/back/src/workers/index.test.ts) testing 2 and 3 competing auto-bidders to ensure multi-step ladders converge to the Vickrey price.
* **Estimated Effort:** 1.5 – 2.0 hours
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)
  * [workers/index.ts](file:///e:/project/auctionhaus/back/src/workers/index.ts)
  * [workers/index.test.ts](file:///e:/project/auctionhaus/back/src/workers/index.test.ts)

---

### ITEM-02: Rewrite Pricing Proof (Theorem 2: Vickrey Equivalence)

* **Reviewer Remark:** *"The pricing proof... require[s] correction."*
* **Validity:** Valid.
* **Problem Analysis:**
  * In [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L469-L472):
    ```latex
    By induction on the number of iterations k. After iteration k, the
    current winner has the kth-largest limit among P \cup {p_0}...
    ```
  * In an English ascending auction with two competing proxies, bidders alternate bids across increments. The winner does not have the $k$-th largest limit; there are only 2 bidders actively competing.
* **What Needs to Be Done:**
  * Rewrite Theorem 2 proof in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L456-L485) using an induction over price steps and pool valuations.
  * Prove that the loop alternates between the top two valuations ($M_{(1)}$ and $M_{(2)}$) until price exceeds $M_{(2)}$, terminating at $P^\star = \min(M_{(1)}, M_{(2)} + \delta)$ with bidder $M_{(1)}$ winning.
* **Estimated Effort:** 2.0 – 3.0 hours
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-03: Reconcile Wallet Accounting Model

* **Reviewer Remark:** *"wallet accounting... require[s] correction."*
* **Validity:** Valid.
* **Problem Analysis:**
  * In [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L252-L253), available balance is defined as $\text{balance}_u - \text{heldAmount}_u$.
  * Algorithm 1 ([auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L378-L384)) and [bid.service.ts](file:///e:/project/auctionhaus/back/src/modules/bidding/bid.service.ts#L168-L170) check `balance - heldAmount >= next`, and then decrement `balance` while incrementing `heldAmount`. This reduces available balance by $2 \times \text{next}$ (double-counting).
  * Line 381 states "release winner's hold" without specifying the exact released amount.
* **What Needs to Be Done:**
  * Standardize the accounting definition: if `balance` is total funds and `heldAmount` is encumbered escrow, placing a hold increments `heldAmount` without decrementing `balance`.
  * Explicitly specify the released amount in Algorithm 1: release previous winning hold by $\text{curWinningAmount}$ and establish new hold for $\text{next}$.
  * Harmonize [processAutoBidLadder](file:///e:/project/auctionhaus/back/src/workers/index.ts#L538-L587) and [bid.service.ts](file:///e:/project/auctionhaus/back/src/modules/bidding/bid.service.ts) to match the paper's model.
* **Estimated Effort:** 1.5 – 2.0 hours
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)
  * [workers/index.ts](file:///e:/project/auctionhaus/back/src/workers/index.ts)
  * [bid.service.ts](file:///e:/project/auctionhaus/back/src/modules/bidding/bid.service.ts)

---

### ITEM-04: Correct Iteration Bound Formula & Complexity (P5)

* **Reviewer Remark:** *"and iteration bound require correction."*
* **Validity:** Valid.
* **Problem Analysis:**
  * In [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L312-L314) and [Section VI.D](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L518-L524), the bound is given as $K_{\max} = \lceil (M_{(1)} - p_0)/\delta \rceil + 1$.
  * An English proxy ladder stops when the runner-up $M_{(2)}$ drops out, so the tight upper bound depends on $M_{(2)}$, not $M_{(1)}$:
    $$K^\star = \left\lceil \frac{\min(M_{(1)}, M_{(2)} + \delta) - p_0}{\delta} \right\rceil \leq \left\lceil \frac{M_{(2)} + \delta - p_0}{\delta} \right\rceil$$
  * Line 520 incorrectly states: *"Each iteration is $O(|\mathcal{P}|)$ wallet/bid writes"*, whereas each iteration writes 1 bid row and updates 2 wallets ($O(1)$ writes).
* **What Needs to Be Done:**
  * Update the bound formula in P5, Algorithm 1 line 368, and Section VI.D.
  * Correct the write complexity description to $O(1)$ database writes and $O(|\mathcal{P}|)$ candidate evaluation.
* **Estimated Effort:** 0.75 – 1.0 hour
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-05: Benchmark Completion Criteria Discrepancy

* **Reviewer Remark:** *"The performance comparison needs consistent completion criteria..."*
* **Validity:** Valid.
* **Problem Analysis:**
  * In [bid-throughput.js](file:///e:/project/auctionhaus/packages/simulator/k6/bid-throughput.js#L5-L7):
    * **Direct Mode (`POST /api/bids/auctions/:id`):** Synchronously awaits PostgreSQL transaction commit and row locks (HTTP 201).
    * **Sequencer Mode (`POST /api/bids/auctions/:id/stream`):** Only appends to Redis Stream via `XADD` (HTTP 202). It does not wait for consumer execution.
  * Comparing synchronous commit latency to asynchronous queue enqueue latency is an asymmetric comparison.
* **What Needs to Be Done:**
  * Update Section VII.A and VII.B in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L538-L593) to explicitly distinguish synchronous durable persistence from asynchronous write-behind ingestion.
  * Document end-to-end consumer drain latency and state clear trade-offs between immediate commit guarantees and queue ingestion throughput.
* **Estimated Effort:** 1.0 – 1.5 hours
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)
  * [bid-throughput.js](file:///e:/project/auctionhaus/packages/simulator/k6/bid-throughput.js)

---

### ITEM-06: Reproducibility Script & Table I Math Discrepancy

* **Reviewer Remark:** *"...reproducible experiments, and clarification of Table II’s throughput discrepancy."*
* **Validity:** Valid.
* **Problem Analysis:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L649) references `npm run sim:ladder`, but the script is missing from [package.json](file:///e:/project/auctionhaus/package.json).
  * Table I ([auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L569)) shows Direct Mode at $C=100$ with $570$ iterations in $15\text{ s}$ ($570 / 15 = 38.0\text{ req/s}$), but states $30.0\text{ bids/s}$ without clarifying that $120$ requests timed out/errored and $450$ succeeded ($450 / 15 = 30.0$).
* **What Needs to Be Done:**
  * Add `"sim:ladder": "k6 run packages/simulator/k6/bid-throughput.js"` to root [package.json](file:///e:/project/auctionhaus/package.json) and [back/package.json](file:///e:/project/auctionhaus/back/package.json).
  * In Table I of [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L555-L575), clarify column definitions: distinguish total iterations (570) from accepted bids (450) and accepted throughput (30.0 bids/s).
* **Estimated Effort:** 0.5 – 0.75 hour
* **Target Files:**
  * [package.json](file:///e:/project/auctionhaus/package.json)
  * [back/package.json](file:///e:/project/auctionhaus/back/package.json)
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-07: Sharpen Novelty & Contribution Narrative

* **Reviewer Remark:** *"The novelty over established transactional locking and sequencing methods should be better demonstrated."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Two-phase row locking with hierarchical lock ordering (Gray & Reuter 1992) and event-sourced stream sequencing (Kafka/Redis) are established engineering patterns.
  * The paper must frame its contribution around the domain challenge: proving that atomic proxy-bid ladder resolution preserves both full **log fidelity** (for auditing and disputes) and **Vickrey equivalence** without deadlocking under high contention, unlike industrial platforms that discard intermediate increments via single-jump approximations.
* **What Needs to Be Done:**
  * Refine Section I (Introduction) and Section III (Related Work) in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) to highlight the synthesis of Vickrey multi-agent auction theory and durable transactional log-fidelity.
* **Estimated Effort:** 1.5 – 2.0 hours
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-08: Multi-Node Distributed Architecture Section

* **Reviewer Remarks (Reviewers #4 & #5):**
  * Reviewer #4: *"Discussing performance behavior in multi-node distributed database environments (beyond single-node PostgreSQL/Redis testbeds) would add valuable depth to the evaluation."*
  * Reviewer #5: *"Further evaluation in multi-node distributed database environments would help establish scalability and practical applicability."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Current evaluation is strictly single-host (Windows 11 with single-instance PostgreSQL and Redis).
  * In distributed systems (e.g., CockroachDB, Citus, or multi-node Redis clusters), two-phase commit (2PC) rounds, raft consensus, and network round-trip time (RTT) add latency to atomic transactions.
* **What Needs to Be Done:**
  * Expand Section VIII.D in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) into a dedicated discussion on multi-node behavior:
    * Analyze distributed transaction overhead (2PC consensus latency) during ladder execution.
    * Contrast single-partition Redis Stream sequencing with distributed partitioning schemes (e.g., Kafka partitioning by `auctionId`).
* **Estimated Effort:** 1.5 – 2.0 hours
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)
