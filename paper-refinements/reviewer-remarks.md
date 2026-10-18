```
8. Technical contributions/Originality of the content
Poor
9. Comments to the Authors
The paper addresses a useful problem, but Algorithm 1 permanently removes the current winning proxy, potentially producing an incorrect winner and price. The pricing proof, wallet accounting, and iteration bound require correction. The performance comparison needs consistent completion criteria, reproducible experiments, and clarification of Table II’s throughput discrepancy. The novelty over established transactional locking and sequencing methods should be better demonstrated.
```

```
9. Comments to the Authors
The manuscript presents the "Atomic Ladder Protocol," a serializable transaction protocol designed for concurrent proxy bidding in real-time online ascending auctions. The protocol preserves intermediate increment bid records within a single atomic database transaction while preventing deadlocks using a two-tier global lock ordering scheme. Major Strengths: Strong theoretical rigor with formal proofs for log fidelity, Vickrey equivalence, conflict serializability, and deadlock freedom. Excellent empirical benchmarks comparing direct row-locking with a Redis Stream event-sourced sequencer (sustaining 975 bids/s with 8.1 ms p95 latency at 100 VUs). Areas for Improvement: Discussing performance behavior in multi-node distributed database environments (beyond single-node PostgreSQL/Redis testbeds) would add valuable depth to the evaluation.
```

```
9. Comments to the Authors
The paper introduces the Atomic Ladder Protocol, a serializable transaction mechanism for concurrent proxy bidding that preserves bid history and prevents deadlocks by ordering global locks.

The protocol is supported by rigorous formal proofs and promising benchmarks demonstrating high throughput and low latency under concurrent bidding. The comparison between row-locking and event-sourced sequencing strengthens the evaluation, although testing is limited to single-node PostgreSQL/Redis configurations. Further evaluation in multi-node distributed database environments would help establish scalability and practical applicability.
```
