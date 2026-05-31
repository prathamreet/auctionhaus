# Viva Preparation Guide: Atomic Ladder Concurrency Protocol

This guide is compiled to prepare you for your oral defense (viva) on the research paper: **"Atomic Ladder Execution: A Serializable Protocol for Multi-Agent Proxy Bidding in Real-Time Auction Platforms"** (`auto-bid-ladder.tex`).

---

## Part 1: Core Conceptual Points

Before diving into the questions, master these five foundational conceptual pillars of your paper:

1. **The Log Fidelity Property (P1):** legitimate user trust, dispute resolution, shill-bidding detection, and machine-learning fraud engines require a detailed audit trail of *every single increment* (rung) that occurred during a proxy-bidding war. Re-creating this client-side for display without a database audit log is insufficient.
2. **Pessimistic Lock-Ordering Invariant (P3/P4):** Under high bidding concurrency, nested transactional operations create transaction deadlocks. The protocol solves this by declaring a global, two-tier lock order: lock the target `Auction` row `FOR UPDATE` first, then lock participating user `Wallet` rows `FOR UPDATE` in lexicographical ascending order of their `userId`. This makes circular waits mathematically impossible.
3. **The Reciprocating Recurse Bottleneck:** Naive log-faithful implementations recurse through the bid service for every increment, taking a fresh transaction per row. This degrades performance, triggers undefined behavior under standard ORMs (flattening nested transactions), and suffers from catastrophic partial-commit states if a network error occurs mid-ladder.
4. **Vickrey Equivalence (P2):** The protocol guarantees that the final settled price equals exactly the second-highest bid limit plus one increment, aligning with a second-price Vickrey auction, regardless of the physical order in which bidders enqueued their proxy bids.
5. **Redis Stream Event Sourcing (W2 Optimization):** Directly hitting the database with concurrent requests collapses performance because of lock managers and row locking (p95 latency of 5.7s under 100 concurrent users). By enqueuing bids to a per-auction FIFO Redis Stream and executing them serially in a single worker thread, locks are always uncontested, yielding 975 bids/s with a p95 latency of 8.1ms.

---

## Part 2: 50 Viva Questions & Concise Conceptual Answers

### Category 1: The Proxy Bidding Problem and Log Fidelity (Q1–Q8)

#### Q1. What is "proxy bidding" and how does it function in online ascending English auctions?
Proxy bidding is a mechanism where a user delegates their maximum price threshold ($M_i$) to the platform. The platform's automated bidding agent then places counter-bids incrementally on the user's behalf—raising the bid by exactly one minimum increment whenever they are outbid—until their maximum limit is reached.

#### Q2. Explain the difference between the "closed-form jump" approach and your "log-faithful" approach.
The closed-form jump calculates the final equilibrium price mathematically in $O(\log N)$ time and writes a single final bid row to the database. The log-faithful approach documents every incremental bidding step (each rung of the ladder) between the initial trigger price and the final winning price as a separate database record.

#### Q3. Why is the closed-form jump considered a compromise by platform operators?
While computationally cheap, it destroys **log fidelity**. The public bid history simply jumps from the starting price to the final price (e.g., \$100 to \$1,100) instantly. This eliminates the forensic audit trail required for regulatory compliance, dispute resolution, behavioral analytics, and real-time shill-bidding detection.

#### Q4. How do platforms like Catawiki, LiveAuctioneers, or Saleroom historically handle log fidelity?
They typically use the closed-form jump in their database and attempt to "re-render" the intermediate ladder rungs on the frontend client-side for display. This keeps the database light but fails to create a true, queryable database audit log, breaking downstream fraud-detection systems.

#### Q5. What is the "Vickrey-style truthful outcome" in English auctions?
As described by Vickrey (1961), under proxy bidding, an English auction is strategically equivalent to a second-price sealed-bid auction. The bidder with the highest valuation wins, but they pay a final price equal to the second-highest valuation plus exactly one minimum increment.

#### Q6. What is the "re-entry" problem under closed-form proxy resolution?
If a manual bidder attempts to place a bid *during* the execution of a closed-form proxy calculation, the database must serialize them. Naive platforms either block the manual bidder (leading to high tail latency) or abort the proxy calculation and roll back, causing livelocks under high contention.

#### Q7. Why is a complete, granular bid log critical for shill-bidding detection?
Real-time shill-bidding detection algorithms rely on feature extraction (e.g., response times, increment ratios, outbid rates). If the platform only records the final closed-form jump, these features become invisible because the intermediate bidding history is completely erased from the database.

#### Q8. Define the "log fidelity" property (Property P1) mathematically.
If an auction's current price starts at $p_0$ and settles at $P^\star$, the bid log must contain exactly one row at each price $p_0 + k\delta$ for $k = 1, 2, \ldots, K$ where $p_0 + K\delta = P^\star$, committed sequentially in price-ascending order.

---

### Category 2: The Atomic Ladder Protocol and Mechanics (Q9–Q18)

#### Q9. Explain the high-level flow of the Atomic Ladder Protocol inside a single database transaction.
When a manual bid triggers resolution, the protocol: (1) opens a serializable transaction, (2) locks the target auction row, (3) loads all active auto-bids sorted by maximum price, (4) lexicographically locks participating wallets, (5) loops to iteratively outbid and insert bid rows one rung at a time, (6) updates the auction's current price, and (7) commits the entire sequence atomically.

#### Q10. What is the role of the $K_{\max}$ bound (Property P5) and why is it necessary?
$K_{\max}$ is the maximum number of loop iterations allowed, calculated as $\lceil (M_{(1)} - \text{cur})/\delta \rceil + 1$. It is necessary to prevent infinite loops or excessive database execution times in the event of malformed inputs or extremely low increments relative to maximum bid limits.

#### Q11. Why does the loop select the active auto-bid pool $\mathcal{P}$ sorting by $M_i$ descending then `createdAt` ascending?
Sorting by $M_i$ descending ensures the highest bid limit is evaluated first, which is necessary to determine the true competitive ladder path. Sorting by `createdAt` ascending acts as a deterministic tie-breaker, giving priority to the proxy bid that was registered earliest on the platform.

#### Q12. How does the protocol handle wallet affordability checks during the loop?
At each rung $k$, the protocol verifies if the selected auto-bidder's wallet has sufficient funds: $\text{balance} - \text{heldAmount} \geq \text{nextPrice}$. If the check fails, the proxy is immediately deactivated, removed from the pool, and the iteration is retried with the next-highest proxy.

#### Q13. Why does the protocol release the funds of the previous winner inside the loop?
Because only the current winning bidder's funds are held in escrow. As the ladder ascends and a new bidder outbids the current winner, the previous winner's held amount must be immediately released back to their available balance, while the new winner's funds are debited and held.

#### Q14. What are the failure modes of the "recursive nested-transaction" implementation?
1. **ORM Deadlocks**: Opening nested interactive transactions inside an existing transaction is unsupported by standard ORMs (like Prisma), causing silent transaction flattening or database deadlocks.
2. **Partial-Commit State**: If a network failure occurs on rung 7 of 12, the transaction aborts halfway, leaving the database in an inconsistent state with no recovery path.

#### Q15. How does the Atomic Ladder Protocol resolve the partial-commit failure mode?
By running the entire ladder resolution within a **single PostgreSQL transaction**. If any error occurs at any point during the ladder execution, the database engine rolls back all inserted bid rows, wallet holds, and price updates, returning the system to a clean, pre-trigger state.

#### Q16. How is the TypeScript reference implementation of the row locks designed in Prisma 5?
Since the Prisma client does not expose a native API for pessimistic row locking, the lock is acquired using a raw SQL query: `await prisma.$queryRaw` executing `SELECT id FROM auctions WHERE id = A FOR UPDATE` within an interactive transaction callback.

#### Q17. Why is the socket event emitted as a single `bid:ladder` payload carrying the entire `steps` array?
Emitting a single socket payload reduces network overhead. Instead of triggering $N$ socket round-trips for an $N$-rung ladder (which causes heavy traffic and rendering lag), a single frame is sent, allowing the React frontend to animate the rungs smoothly in one render lifecycle.

#### Q18. How much does this socket optimization reduce network frames under load?
For an auction with 200 subscribed websocket clients and a 10-rung ladder, it reduces the total socket frames transmitted from **2,000** separate frames (10 rungs * 200 clients) down to just **200** frames (1 single array frame * 200 clients)—a 10x network reduction.

---

### Category 3: Locking Strategies and Concurrency Control (Q19–Q28)

#### Q19. What is "pessimistic row locking" and why is it required over optimistic locking here?
Pessimistic row locking (`FOR UPDATE`) actively blocks concurrent transactions from writing to the locked rows. Optimistic locking (using version numbers) would fail catastrophically under high bidding concurrency, causing constant rollback retries (livelock) and destroying bidding throughput.

#### Q20. Detail the global "two-tier lock-ordering policy" enforced by AuctionHaus.
The policy enforces that **every** write operation in the platform must acquire locks in a strict order:
1. Acquire the `Auction` row lock `FOR UPDATE` first.
2. Acquire the participating `Wallet` row locks `FOR UPDATE` in **ascending alphabetical/lexicographical order of their `userId`**.

#### Q21. Why is this lock-ordering policy guaranteed to prevent transaction deadlocks?
Deadlocks only occur when a circular wait-for cycle is formed (e.g., Transaction 1 holds Lock A and waits for Lock B, while Transaction 2 holds Lock B and waits for Lock A). By enforcing a strict global sorting order, no circular dependency graph can ever form, rendering deadlocks mathematically impossible.

#### Q22. Why are wallet locks sorted specifically by `userId` ascending, rather than wallet ID or order of arrival?
Order of arrival is non-deterministic and varies with concurrent request threads, which causes deadlocks. Hashing or using wallet IDs is fine, but sorting lexicographically by `userId` ascending is a simple, globally accessible, and deterministic invariant that guarantees consistent lock order across all services.

#### Q23. What happens to a concurrent `PlaceBid` request while a ladder is executing?
The concurrent `PlaceBid` request attempts to acquire the same `Auction` row lock. It is blocked at the database level by the executing transaction. Once the ladder transaction commits, the `PlaceBid` request acquires the lock, reads the newly updated `currentPrice`, and executes cleanly as a serial extension.

#### Q24. How does your locking strategy handle `Withdraw` or `BuyNow` operations during an active ladder?
Because both `Withdraw` and `BuyNow` operations must interact with the auction and wallet tables, they obey the exact same lock-ordering policy (Auction first, then Wallet). This prevents them from slipping in and creating deadlock cycles with concurrent auto-bid resolutions.

#### Q25. Why is PostgreSQL's default `READ COMMITTED` isolation level insufficient without row locks?
In `READ COMMITTED`, concurrent transactions read the same initial state (e.g., price = \$100). Both validate that their bid is higher, and both attempt to write. Without row locks, they would overwrite each other's updates (lost update anomaly), producing two winning bids at the same price.

#### Q26. Explain how `SELECT ... FOR UPDATE` acts as the universal serialization point in your system.
The database engine serializes transactions based on the order in which they successfully acquire the lock on the `Auction` row. The first transaction to acquire the lock determines the schedule; subsequent transactions block and execute one after another in a deterministic queue.

#### Q27. Does your locking policy introduce a bottleneck under low concurrency?
No. When there is no concurrent activity, the pessimistic locks are acquired instantly with negligible database overhead (<1ms), ensuring that single-user bid paths remain highly responsive.

#### Q28. What is the impact of lock ordering on the database's internal Lock Manager?
By preventing circular waits, the database's internal deadlock detection daemon never has to intervene to kill transactions. This reduces database CPU overhead and prevents random transaction aborts under extreme concurrency.

---

### Category 4: Vickrey Equivalence and Algorithmic Determinism (Q29–Q35)

#### Q29. State Theorem 2 (Vickrey Equivalence) in your own words.
For any set of active auto-bids, when a manual bid triggers the ladder resolution, the final price committed will always equal the second-highest bid limit plus exactly one increment (or the highest limit if the difference is smaller), regardless of the order in which the auto-bids were enqueued.

#### Q30. Why is Vickrey equivalence highly desirable in proxy-bidding systems?
Because it ensures **fairness**. Bidders are strategically incentivized to submit their true maximum valuation as their proxy limit, knowing the system guarantees they will pay only the minimum necessary to outbid their competitors, with no strategic advantage given to timing.

#### Q31. What is "algorithmic determinism" and why did you test it using SHA-256 hashes?
Algorithmic determinism means that given the same sequence of bid arrivals, the system will always output the exact same bid log structure and final price. We verified this by running the same test input 5 times and hashing the resulting database log; the single-jump and atomic ladder consistently produced 1 unique hash.

#### Q32. Why did the recursive nested-transaction implementation fail the determinism test?
Because under high concurrency, its partial-commit failures left the database in varying incomplete intermediate states. Across 5 runs, it produced between 3 and 5 distinct log hashes, demonstrating a non-deterministic and unstable execution path.

#### Q33. Show the formula for the Vickrey equilibrium price $P^\star$.
$$P^\star = \min(M_{(1)},\, M_{(2)} + \delta)$$
where $M_{(1)}$ is the highest proxy limit, $M_{(2)}$ is the second-highest limit, and $\delta$ is the minimum required increment.

#### Q34. How does the protocol handle a tie where two proxy bids have the exact same maximum limit ($M_1 = M_2$)?
The tie is resolved by the `createdAt` timestamp. The proxy bid that was registered earliest on the database gains priority. The later proxy bid will bid up to its maximum, and the earlier proxy bid will win at exactly that price (since $\min(M_1, M_2 + \delta)$ evaluates to $M_1$ because no further increment is possible).

#### Q35. What is the "Vickrey Equivalence" average accuracy rate shown in Table IV for the single-jump vs. atomic ladder?
Both achieve 100% Vickrey Equivalence because both mathematically land at the same final price. The crucial difference is that the single-jump achieves this with only **12.5% Log Fidelity** (creating 1 row instead of 8), whereas the atomic ladder achieves **100% Log Fidelity** (creating all 8 rows).

---

### Category 5: Redis Stream Sequencer and High Throughput (Q36–Q42)

#### Q36. Why does direct database row locking degrade so heavily under 100 concurrent bidders (Table III)?
Because 100 concurrent HTTP requests simultaneously open database transactions and attempt to lock the same `Auction` row. The database's lock manager becomes a bottleneck, forcing transactions to wait in queue. This causes thread exhaustion in Node.js, transaction timeouts, and a collapse in throughput to just **30 bids/s** with p95 latency of **5,772ms**.

#### Q37. Explain the architecture of the Redis Stream Sequencer (W2).
Instead of allowing HTTP requests to touch the database directly, the API immediately enqueues incoming bids to a per-auction FIFO **Redis Stream** using `XADD`. A single, dedicated background worker dequeues bids from the stream using `XREADGROUP` and applies them sequentially to PostgreSQL.

#### Q38. Why does the Redis Stream Sequencer completely eliminate lock contention?
Because there is only **one** background worker thread executing transactions against the database for a given auction. Since there are no concurrent transactions trying to lock the same `Auction` row, database locks are always uncontested, allowing transactions to execute and commit at maximum hardware speed.

#### Q39. Discuss the performance metrics of the Redis Stream Sequencer at 100 concurrent bidders.
Under 100 concurrent users, the Redis Stream Sequencer maintains a throughput of **975 bids/s** and a p95 latency of just **8.1ms**. This represents a **32.5x throughput improvement** and a **712x latency reduction** compared to direct row locking.

#### Q40. Why does the Redis Stream Sequencer perform faster even at a low concurrency of 1 user (134ms vs. 236ms)?
Because enqueuing to Redis is an in-memory operation that completes in less than a millisecond, freeing up the client response thread immediately. The asynchronous background worker then writes to Postgres without having to manage thread-pool context switching or lock manager queues.

#### Q41. How does the sequencer handle worker crashes? What guarantees do you have?
The Redis Stream sequencer guarantees **at-least-once delivery**. It uses Redis consumer groups with explicit acknowledgments (ACKs). If a worker crashes mid-execution, the bid remains in the stream's Pending Entry List (PEL). A restarting worker will re-claim the pending bid and re-execute it.

#### Q42. How does the system handle idempotency under BullMQ worker re-delivery?
If a job is re-delivered, it runs against the current database state. Since the auction's `currentPrice` has already advanced past the job's trigger criteria, the re-executed job simply determines that the proxy bid has already been surpassed and safely no-ops without inserting duplicate rows.

---

### Category 6: Correctness Proofs and Error Handling (Q43–Q47)

#### Q43. Outline the proof for Theorem 1 (Log Fidelity).
The loop starts at $p_0$ and, on each non-skipped iteration, inserts a row at exactly $\text{next} = \text{cur} + \delta$. Since deactivations do not advance the price, no gaps can occur. Because all rows are inserted in the same transaction, their database insertion order (`ctid`) matches their price-ascending order, ensuring a continuous and sequential log.

#### Q44. Outline the proof for Theorem 4 (Deadlock Freedom).
All transactions globally acquire locks in the exact same total order: `Auction` row first, then participating `Wallet` rows in lexicographical ascending order of `userId`. By Bernstein et al. (1987), enforcing a strict global sorting on locked resources eliminates wait-for cycles, ensuring deadlock freedom.

#### Q45. What happens if a database connection drops in the middle of a 100-rung ladder execution?
Because the loop executes inside a single interactive transaction, the database engine detects the connection loss, aborts the entire transaction, and rolls back all modifications. No partial rungs are committed, preventing database corruption.

#### Q46. Why not use PostgreSQL's native `SERIALIZABLE` isolation level instead of manual `FOR UPDATE` locking?
PostgreSQL's `SERIALIZABLE` isolation level uses optimistic concurrency control (SIREAD locks) to detect serialization anomalies. Under high bidding concurrency, it would frequently abort transactions with `40001` serialization failures, requiring constant application-level retries that would collapse throughput.

#### Q47. How does the system prevent a malicious user from committing a proxy bid without funding, blocking other bidders?
Because the wallet affordability check is executed dynamically inside the transaction before any rung is committed. If a user runs out of funds, their proxy is instantly deactivated. This deactivation is committed, so they cannot block future bidding rounds.

---

### Category 7: Limitations and Future Scope (Q48–Q50)

#### Q48. What are the key limitations of your single-host evaluation setup?
The evaluation was executed on a single host. In a distributed production deployment, network round-trips to a database cluster, replica sync delays, and Socket.io Redis adapter synchronization would add latency that could impact the comparative throughput metrics.

#### Q49. What is the "portfolio resolver" listed as future work?
A cross-auction portfolio resolver is an online budget-allocation algorithm. If a user has a wallet balance of \$5,000 and places concurrent auto-bids on three active auctions (each with a max limit of \$3,000), the portfolio resolver dynamically adjusts the active limits across the auctions in real time to prevent the user's total active liabilities from exceeding their actual wallet balance.

#### Q50. Why is formal verification in TLA+ proposed as a next step?
While we have mathematical proofs, a TLA+ model checker can exhaustively test every interleaving state, network partition, and worker crash scenario to mathematically guarantee that the protocol's lock-ordering invariants and serializability holds true across all edge cases.

---

## Part 3: Quick-Fire "Defense" Cheat Sheet

If the examiner fires a challenging question, use this structural alignment to defend your work:

*   **To defend the 10% throughput cost compared to Single-Jump:** *"The 10% throughput trade-off is a deliberate design decision. For consumer-facing platforms, the value of total log fidelity for compliance, disputes, and fraud ML engines far outweighs a marginal raw write speed increase. We recover this throughput entirely via our Redis Stream sequencer."*
*   **To defend single-instance Redis worker limitation:** *"Our Redis sequencer acts as a partition-level lock. Under horizontal scaling, we hash and partition streams by `auctionId`. Bids for a specific auction are handled by a single-threaded consumer to prevent race conditions, while different auctions are processed in parallel."*
*   **To defend z-sorting of auto-bids inside Node.js memory instead of database queries:** *"Z-sorting in memory is extremely efficient because the active auto-bid pool per auction is small (typically <100 active proxies). Loading the array and sorting it in Node.js takes less than 0.1ms, avoiding repeated slow database indexing operations during the loop."*
*   **To defend the lack of testing on distributed database replicas:** *"Our protocol enforces strong serializability at the primary database level. In a standard write-heavy system, all writes and row locks must route to the primary database writer anyway, so replica read lag does not affect the safety or correctness of the ladder execution."*
