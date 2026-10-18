# Open Items: ICDDS 2026 Paper Refinements

This document tracks all actionable feedback, technical gaps, and required revisions identified from the peer reviews for Paper ID 1255: **"Atomic Ladder Execution: A Serializable Protocol for Concurrent Proxy Bidding in Real-Time Auction Platforms"** ([auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)).

Original reviews are recorded in [reviewer-review.md](file:///e:/project/auctionhaus/paper-refinements/reviewer-review.md) and [reviewer-remarks.md](file:///e:/project/auctionhaus/paper-refinements/reviewer-remarks.md).

---

## Executive Summary & Decision Matrix

| ID | Item | Source | Validity | Priority | Estimated Effort | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **ITEM-01** | Fix Proxy Pool Filter Bug (Algorithm 1 & Backend Worker) | Reviewer #3 | Valid | P0 (Critical) | 1.5 – 2.0 h | Completed |
| **ITEM-02** | Rewrite Pricing Proof (Theorem 2: Vickrey Equivalence) | Reviewer #3 | Valid | P0 (Critical) | 2.0 – 3.0 h | Completed |
| **ITEM-03** | Reconcile Wallet Accounting Model (Paper & Code) | Reviewer #3 | Valid | P0 (Critical) | 1.5 – 2.0 h | Completed |
| **ITEM-04** | Correct Iteration Bound Formula & Complexity (P5) | Reviewer #3 | Valid | P0 (Critical) | 0.75 – 1.0 h | Completed |
| **ITEM-05** | Benchmark Completion Criteria (Sync Commit vs Async Enqueue) | Reviewer #3 | Valid | P1 (High) | 1.0 – 1.5 h | Completed |
| **ITEM-06** | Reproducibility Script & Table I Math Discrepancy | Reviewer #3 | Valid | P1 (High) | 0.5 – 0.75 h | Completed |
| **ITEM-07** | Sharpen Novelty & Contribution Narrative | Reviewer #3 | Valid | P1 (High) | 1.5 – 2.0 h | Completed |
| **ITEM-08** | Multi-Node Distributed Architecture Section | Reviewers #4, #5 | Valid | P2 (Medium) | 1.5 – 2.0 h | Completed |
| **ITEM-09** | Missing BibTeX Entry for Thompson2011 (LMAX Disruptor) | Self-detected | Valid | P0 (Critical) | 0.1 h | Open |
| **ITEM-10** | Stale Compiled Artifacts & Multi-Node Heading Sync | Self-detected | Valid | P0 (Critical) | 0.25 h | Open |
| **ITEM-11** | Discrepancy in Cover Letter Title, Venue, and Content | Self-detected | Valid | P0 (Critical) | 0.5 h | Open |
| **ITEM-12** | Unsubstantiated Industrial Observation Claims (eBay/Catawiki) | Self-detected | Valid | P1 (High) | 0.25 – 0.5 h | Open |
| **ITEM-13** | Theorem 2 Equal-Limit ($M_{(1)} = M_{(2)}$) Tie-Break Edge Case | Self-detected | Valid | P1 (High) | 0.25 – 0.5 h | Open |
| **ITEM-14** | Precise Characterization of Distributed Commit Latency ($2 \times \text{RTT}$) | Self-detected | Valid | P1 (High) | 0.25 h | Open |
| **ITEM-15** | Table Numbering Reconciliation in Response Letter (Table I vs II) | Self-detected | Valid | P1 (High) | 0.1 h | Open |
| **ITEM-16** | Explicit Proof Step for Auction Lock Isolation in Property P1 | Self-detected | Valid | P1 (High) | 0.25 h | Open |
| **ITEM-17** | Uncited / Phantom Bibliography Entries in Generated .bbl | Self-detected | Valid | P1 (High) | 0.25 h | Open |
| **ITEM-18** | Paper Title Alignment Between Manuscript and Conference Submission | Self-detected | Valid | P2 (Medium) | 0.1 h | Open |
| **ITEM-19** | Correction of Worker Implementation Line Count Assertion | Self-detected | Valid | P2 (Medium) | 0.1 h | Open |
| **ITEM-20** | Rigorous Formulation of Contention Lock-Wait Scaling | Self-detected | Valid | P2 (Medium) | 0.1 h | Open |
| **ITEM-21** | Explicit Wallet Solvency Precondition in Theorem 2 Inductive Step | Self-detected | Valid | P2 (Medium) | 0.25 h | Open |
| **ITEM-22** | Addition of IEEE Acknowledgment & AI Assistance Disclosure | Self-detected | Valid | P2 (Medium) | 0.1 h | Open |
| **ITEM-23** | BibTeX Typographical and Type Hygiene (Brandt2006, Shoup2004) | Self-detected | Valid | P2 (Medium) | 0.1 h | Open |
| **ITEM-24** | LaTeX Hygiene, Link Formatting, and Package Optimization | Self-detected | Valid | P3 (Low) | 0.25 h | Open |

**Total Estimated Effort:** **~13 – 17.5 hours** (~10 – 14 h reviewer items [Completed], ~2.5 – 3.5 h self-detected items [Open])

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
* **Status:** Completed
* **Resolution:** Algorithm 1 in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) and [processAutoBidLadder](file:///e:/project/auctionhaus/back/src/workers/index.ts) updated to non-destructively select candidates using `pool.find(ab => ab.bidderId !== curWinnerUserId)` without permanently dropping the current winner. Regression unit tests for 2- and 3-competing auto-bidders added to [index.test.ts](file:///e:/project/auctionhaus/back/src/workers/index.test.ts).
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
* **Status:** Completed
* **Resolution:** Rewrote Theorem 2 proof in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) with induction over ladder rungs and pool order statistics, proving monotonic alternating escalation between the top two valuations ($M_{(1)}$ and $M_{(2)}$) until the runner-up drops out at $P^\star = \min(M_{(1)}, M_{(2)} + \delta)$.
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
* **Status:** Completed
* **Resolution:** Standardized on total-balance and escrow-hold model across [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex), [workers/index.ts](file:///e:/project/auctionhaus/back/src/workers/index.ts), [bid.service.ts](file:///e:/project/auctionhaus/back/src/modules/bidding/bid.service.ts), and [escrow.service.ts](file:///e:/project/auctionhaus/back/src/modules/escrow/escrow.service.ts): holds increment `heldAmount` without decrementing `balance`, releases decrement `heldAmount`, and settlement decrements both `balance` and `heldAmount`. All test suites synchronized.
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
* **Status:** Completed
* **Resolution:** Corrected Property P5, Algorithm 1 line 368, and Section VI.D in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) to derive the tight upper bound $K^\star = \lceil (\min(M_{(1)}, M_{(2)} + \delta) - p_0)/\delta \rceil$ governed by $M_{(2)}$, and corrected write complexity to $O(1)$ writes and $O(|\mathcal{P}|)$ candidate evaluation per step. Updated `stepCeiling` in [workers/index.ts](file:///e:/project/auctionhaus/back/src/workers/index.ts).
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
* **Status:** Completed
* **Resolution:** Updated Section VII.A and VII.B in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) and [bid-throughput.js](file:///e:/project/auctionhaus/packages/simulator/k6/bid-throughput.js) to explicitly define completion criteria (synchronous PostgreSQL WAL commit HTTP 201 vs. asynchronous Redis Stream enqueue HTTP 202) and document consumer drain throughput and trade-offs.
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
* **Status:** Completed
* **Resolution:** Added `"sim:ladder": "k6 run packages/simulator/k6/bid-throughput.js"` to root [package.json](file:///e:/project/auctionhaus/package.json) and [back/package.json](file:///e:/project/auctionhaus/back/package.json). Updated Table I in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) with separate `Total Reqs` (570) and `Accepted` (450) columns, resolving the arithmetic discrepancy.
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
* **Status:** Completed
* **Resolution:** Enriched Section I (Introduction) and Section III (Related Work) in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) to frame the 3-way architectural trilemma (Single-Jump vs. Naive Stepwise vs. Atomic Ladder) and contrast dynamic multi-party escrow concurrency against textbook 2PL and streaming engines.
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
* **Status:** Completed
* **Resolution:** Added dedicated Subsection VIII.D in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) analyzing multi-node distributed database behavior, 2PC consensus overhead, multi-shard lock invariants, partitioned stream routing by auctionId, and horizontal scaling.
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-09: Missing BibTeX Entry for Thompson2011 (LMAX Disruptor)

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Line 251 in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L251) cites `\cite{Thompson2011}` when referencing the LMAX Disruptor architecture.
  * The citation key `Thompson2011` is missing from [references.bib](file:///e:/project/auctionhaus/paper/references.bib), which causes LaTeX to output a broken `[?]` citation in the compiled PDF.
* **What Needs to Be Done:**
  * Add the complete `@inproceedings{Thompson2011, ...}` entry to [references.bib](file:///e:/project/auctionhaus/paper/references.bib).
* **Estimated Effort:** 0.1 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [references.bib](file:///e:/project/auctionhaus/paper/references.bib)

---

### ITEM-10: Stale Compiled Artifacts & Multi-Node Heading Sync

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * The current compiled output files ([auto-bid-ladder.aux](file:///e:/project/auctionhaus/paper/auto-bid-ladder.aux), [auto-bid-ladder.bbl](file:///e:/project/auctionhaus/paper/auto-bid-ladder.bbl), [auto-bid-ladder.pdf](file:///e:/project/auctionhaus/paper/auto-bid-ladder.pdf)) are from a prior build.
  * The `.aux` file maps Section VIII.D to "Threats to Validity", omitting the newly added Subsection VIII.D ("Multi-Node Distributed Architecture and Scalability").
* **What Needs to Be Done:**
  * Execute a clean multi-pass LaTeX compilation sequence (`pdflatex -> bibtex -> pdflatex -> pdflatex`) to refresh `.aux`, `.bbl`, and `.pdf` files and ensure all section headers and citations resolve correctly.
* **Estimated Effort:** 0.25 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-11: Discrepancy in Cover Letter Title, Venue, and Content

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * [cover-letter.tex](file:///e:/project/auctionhaus/paper/cover-letter.tex#L42) currently references a different paper ("Real-Time Shill-Bidding Detection via Online Bid-Graph Analytics in Live Auction Platforms") and addresses "IEEE Transactions on Services Computing" with a June 2026 date.
* **What Needs to Be Done:**
  * Rewrite [cover-letter.tex](file:///e:/project/auctionhaus/paper/cover-letter.tex) to align with Paper ID 1255 ("Atomic Ladder Execution: A Serializable Protocol for Multi-Agent Proxy Bidding in Real-Time Auction Platforms"), targeting the ICDDS 2026 conference with current submission date and accurate summary.
* **Estimated Effort:** 0.5 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [cover-letter.tex](file:///e:/project/auctionhaus/paper/cover-letter.tex)

---

### ITEM-12: Unsubstantiated Industrial Observation Claims (eBay/Catawiki)

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Lines 99–101 in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L99-L101) assert: *"External observation of major platforms (eBay, Catawiki, LiveAuctioneers) confirms that users only ever witness the final jump rather than the underlying ascending trajectory."*
  * This makes an unreferenced empirical claim about commercial platforms without citing observational methodology or platform documentation.
* **What Needs to Be Done:**
  * Clarify the statement by attributing it to observable consumer-facing bid history UIs (with an explanatory footnote or citation to auction literature such as Ockenfels et al.~\cite{Ockenfels2006}), or rephrase with defensible industry architecture terms.
* **Estimated Effort:** 0.25 – 0.5 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-13: Theorem 2 Equal-Limit ($M_{(1)} = M_{(2)}$) Tie-Break Edge Case

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * In [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L494-L516), the pricing proof focuses on the strictly ordered case $M_{(1)} > M_{(2)}$.
  * When two auto-bidders share identical limits ($M_{(1)} = M_{(2)}$), the algorithm relies on deterministic `createdAt` tie-breaking. The inductive proof does not explicitly formalize this tie-breaking step.
* **What Needs to Be Done:**
  * Add explicit coverage in the Theorem 2 proof demonstrating that when $M_{(1)} = M_{(2)}$, deterministic ordering on registration timestamp ensures termination at $P^\star = M_{(1)}$ with the earlier-registered bidder winning.
* **Estimated Effort:** 0.25 – 0.5 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-14: Precise Characterization of Distributed Commit Latency ($2 \times \text{RTT}$)

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Line 760 in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L760) states that distributed commits pay *"a consensus latency penalty of $2 \times \text{RTT}$ across participating shards."*
  * While standard Two-Phase Commit (2PC) involves 2 round trips (prepare + commit), replicated state machines (Raft/Paxos) incur additional replica quorum rounds.
* **What Needs to Be Done:**
  * Qualify the latency cost to specify $2 \times \text{RTT}$ for the 2PC coordinator phases, noting additional quorum overhead for Paxos/Raft shard consensus ($\geq 2 \times \text{RTT}$).
* **Estimated Effort:** 0.25 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-15: Table Numbering Reconciliation in Response Letter (Table I vs II)

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Reviewer #3 referenced "Table II’s throughput discrepancy". In the revised manuscript, the throughput benchmark is Table I ([auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L555-L575)).
* **What Needs to Be Done:**
  * Explicitly record in the author rebuttal letter that Table II from the original submission corresponds to Table I in the revised paper following restructuring.
* **Estimated Effort:** 0.1 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [paper-refinements/open-items.md](file:///e:/project/auctionhaus/paper-refinements/open-items.md)

---

### ITEM-16: Explicit Proof Step for Auction Lock Isolation in Property P1

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Property P1 (Log Fidelity) proof in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L474-L480) proves that ladder rows are generated consecutively within a single transaction.
  * It does not explicitly mention that the row-level `FOR UPDATE` lock on the auction record prevents concurrent manual `PlaceBid` transactions from interleaving intermediate bids.
* **What Needs to Be Done:**
  * Add a sentence to the P1 proof stating that external concurrent bids cannot interleave due to the exclusive auction row lock held throughout ladder execution.
* **Estimated Effort:** 0.25 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-17: Uncited / Phantom Bibliography Entries in Generated .bbl

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * `Kleppmann2017`, `Shoup2004`, and `Ockenfels2006` appear in [auto-bid-ladder.bbl](file:///e:/project/auctionhaus/paper/auto-bid-ladder.bbl) but are not currently cited in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex).
* **What Needs to Be Done:**
  * Add inline citations for relevant works (e.g., Ockenfels et al. in Related Work on online auction dynamics, Shoup in industrial architecture context) or remove uncited entries from [references.bib](file:///e:/project/auctionhaus/paper/references.bib) to ensure a clean bibliography.
* **Estimated Effort:** 0.25 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)
  * [references.bib](file:///e:/project/auctionhaus/paper/references.bib)

---

### ITEM-18: Paper Title Alignment Between Manuscript and Conference Submission

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * The peer review record in [reviewer-review.md](file:///e:/project/auctionhaus/paper-refinements/reviewer-review.md) registers the paper as *"Concurrent Proxy Bidding"*, whereas [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L30) specifies *"Multi-Agent Proxy Bidding"*.
* **What Needs to Be Done:**
  * Verify and synchronize the title metadata across the conference portal, manuscript, and response documentation.
* **Estimated Effort:** 0.1 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-19: Correction of Worker Implementation Line Count Assertion

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Line 165 of [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L165) states that `processAutoBidLadder` comprises *"about 180 lines of TypeScript"*, whereas the function in [workers/index.ts](file:///e:/project/auctionhaus/back/src/workers/index.ts#L409-L621) spans 213 lines.
* **What Needs to Be Done:**
  * Update the line count description in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) to *"approximately 210 lines"*.
* **Estimated Effort:** 0.1 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-20: Rigorous Formulation of Contention Lock-Wait Scaling

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Lines 789–792 of [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L789-L792) assert that network RTT affects lock-wait duration *"quadratically"* under contention without mathematical derivation.
* **What Needs to Be Done:**
  * Refine the assertion to state that lock contention causes *"super-linear"* latency growth under standard queuing models, citing established literature.
* **Estimated Effort:** 0.1 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-21: Explicit Wallet Solvency Precondition in Theorem 2 Inductive Step

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * Theorem 2 proof in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L501-L506) assumes that candidate auto-bidders have sufficient available wallet balances to satisfy escalating rungs.
* **What Needs to Be Done:**
  * Explicitly state the assumption that participants maintain solvent balances, noting that insolvency mid-ladder causes standard candidate deactivation and order-statistic reindexing.
* **Estimated Effort:** 0.25 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-22: Addition of IEEE Acknowledgment & AI Assistance Disclosure

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) lacks an Acknowledgment section, which is referenced in the cover letter regarding AI assistance disclosure.
* **What Needs to Be Done:**
  * Insert an `\section*{Acknowledgment}` section before the bibliography in [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex) detailing tool usage and authorship responsibility.
* **Estimated Effort:** 0.1 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)

---

### ITEM-23: BibTeX Typographical and Type Hygiene (Brandt2006, Shoup2004)

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * In [references.bib](file:///e:/project/auctionhaus/paper/references.bib#L32-L40), `Brandt2006` is defined as `@book` despite containing a conference `booktitle`.
  * `Shoup2004` ([references.bib](file:///e:/project/auctionhaus/paper/references.bib#L104-L110)) has a key indicating 2004 but `year = {2008}` in the body.
* **What Needs to Be Done:**
  * Change `Brandt2006` to `@inproceedings` and harmonize the `Shoup` key and year.
* **Estimated Effort:** 0.1 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [references.bib](file:///e:/project/auctionhaus/paper/references.bib)

---

### ITEM-24: LaTeX Hygiene, Link Formatting, and Package Optimization

* **Reviewer Remark:** *"Self-detected during pre-submission adversarial review."*
* **Validity:** Valid.
* **Problem Analysis:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex#L13-L16) loads `pgfplots` without generating plots.
  * `\usepackage{hyperref}` is loaded without `hidelinks`.
  * Conclusion open work list (line 820) mentions multi-node measurements without cross-referencing Subsection VIII.D.
* **What Needs to Be Done:**
  * Remove unused `pgfplots` package, add `[hidelinks]` to `hyperref`, and align the conclusion wording with Section VIII.D.
* **Estimated Effort:** 0.25 hour
* **Status:** Open
* **Resolution:** N/A
* **Target Files:**
  * [auto-bid-ladder.tex](file:///e:/project/auctionhaus/paper/auto-bid-ladder.tex)
