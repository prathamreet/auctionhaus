# Viva Preparation Guide: Real-Time Shill-Bidding Detection

This guide is compiled to prepare you for your oral defense (viva) on the research paper: **"Real-Time Shill-Bidding Detection via Online Bid-Graph Analytics in Live Auction Platforms"** (`main.tex`). 

---

## Part 1: Core Conceptual Points

Before diving into the questions, master these five foundational conceptual pillars of your paper:

1. **Timing Paradigm (Real-time vs. Post-hoc):** Prior work (Trevathan, Ford, Tsang) processes logs offline *after* auctions end. Your novelty is *online detection*—scoring bids during a live auction (with sub-millisecond in-process latency) to allow active intervention (voiding bids, throttling, or suspending accounts) before the hammer falls.
2. **In-Memory Sliding-Window Bid Graph:** The engine maintains an active bipartite graph $\mathcal{G}(t, W)$ representing the last $W = 30$ minutes of bidding activity. Bidders and auctions are nodes; bid events are directed, labeled edges. Lazily pruned in $O(1)$ amortized time.
3. **The Five-Feature Vector:**
   * **F1: Response Time ($\tau$):** Time delay between a bid and the preceding competitor bid. Captures sub-second bot reactions.
   * **F2: Bid Frequency ($\phi$):** Bidder's globally normalized activity rate in the sliding window. Signals multi-auction price driving.
   * **F3: Increment Ratio ($\rho$):** Ratio of bid increment to the minimum increment. Signals tight, automated minimum driving.
   * **F4: Seller Co-occurrence ($\sigma$):** Number of distinct auctions hosted by the same seller that the bidder bid on. Signals seller-collusion.
   * **F5: Reciprocity ($\gamma$):** Percentage of mutual outbidding edges. Captures structural collusion loops.
4. **Logistic Regression with Inverted Calibration:** Real-time demands low computational overhead (<1ms) and explainability. A logistic regression classifier operates on z-scored features. A low decision threshold ($\theta = 0.05$) is chosen to maximize recall (catching fraudsters immediately) at a minor cost to precision.
5. **Architectural Optimizations:** 
   * **W1 Protocol (Sealed-Bid Cryptography):** A two-phase SHA-256 commit-reveal protocol preventing bid leakage and server-side cheating.
   * **W2 Engine (Redis Stream Sequencer):** Resolves database lock contention. Enqueues concurrent bids in <1ms to a FIFO Redis Stream, which a single-threaded consumer writes to Postgres sequentially, eliminating thread blocking and reducing p99 latency by 10x.

---

## Part 2: 50 Viva Questions & Concise Conceptual Answers

### Category 1: The Research Problem and Novelty (Q1–Q8)

#### Q1. What is "shill bidding" and why is it a critical problem for online auction platforms?
Shill bidding is a fraudulent practice where a seller, or an accomplice (confederate), bids on the seller's own item to artificially inflate its price, forcing legitimate buyers to pay more. It is critical because it destroys user trust, violates bidding integrity, and represents a market failure where prices do not reflect true organic demand.

#### Q2. What is the key limitation of prior shill-bidding detection systems?
Prior detection systems are exclusively **post-hoc**. They extract data and run classifiers offline on completed auction logs. While they can identify fraud historically, the auction has already closed, the seller has been paid, and the buyer has already suffered financial harm, preventing active intervention.

#### Q3. How does AuctionHaus solve this limitation?
AuctionHaus introduces an **online** fraud detection engine that scores bid events in real time as they arrive. By utilizing a rolling sliding-window bid graph, it flags suspicious bidding patterns and alerts administrators, allowing them to warn, throttle, or void bids *before* the auction terminates.

#### Q4. What are the four core contributions of your paper?
1. An in-process, sliding-window **online bid-graph engine** that calculates features in sub-milliseconds.
2. A **synthetic agent simulator** defining four user/bot personas to generate ground-truth-labeled data.
3. A **cryptographic sealed-bid protocol** (W1) using SHA-256 commit-reveal to eliminate server-side leakage.
4. An **architectural throughput optimization** (W2) utilizing a Redis Stream bid sequencer to alleviate database row locking under high concurrency.

#### Q5. Why is "sub-millisecond overhead per bid" a necessary requirement for your system?
Because the fraud detection engine runs inline with the bid-writing path. If scoring a bid introduced high latency (e.g., 50–100ms), it would degrade the user experience, cause bidding bottlenecks during snipes, and severely limit platform throughput.

#### Q6. What does "in-process" mean in the context of your fraud engine, and why did you choose this design?
"In-process" means the fraud engine runs within the main Node.js application process memory space, rather than as a separate network-connected microservice. This eliminates network serialization, inter-process communication (IPC) latency, and connection overhead, ensuring the engine runs in sub-milliseconds.

#### Q7. What are the legal or regulatory implications of shill bidding?
Shill bidding is considered wire fraud, consumer fraud, or bid rigging in many jurisdictions. Because it represents a deceptive business practice that causes direct financial damage, platforms are legally obligated to detect, mitigate, and report such activities.

#### Q8. Why can't traditional auction platforms like eBay easily adopt real-time detection?
Traditional platforms operate on highly distributed, heterogeneous microservice architectures where bid events, user profiles, and auction data are separated across different data stores. Aggregating these signals into a unified real-time bipartite graph with sub-millisecond latency is historically difficult without a localized cache or streaming engine.

---

### Category 2: Bid Graph Representation and Streaming Features (Q9–Q20)

#### Q9. Explain the formal definition of the active bipartite bid graph $\mathcal{G}(t, W)$.
The graph $\mathcal{G}(t, W)$ is maintained in memory where $W = 30$ minutes. The nodes in the graph consist of two disjoint sets: Bidders ($U$) and Auctions ($A$). The edges ($E$) represent individual bid events occurring between time $t - W$ and $t$, labeled with the bid amount and timestamp.

#### Q10. What is lazy pruning, and why is it preferred over continuous timer-based eviction?
Continuous timer-based eviction requires active background threads and locks to remove expired edges, introducing overhead. Lazy pruning removes expired edges ($\text{ts} < t - W$) on-the-fly during new bid insertions. This ensures the prune operation amortizes to $O(1)$ time complexity without background thread overhead.

#### Q11. Define the Response Time ($\tau$) feature. Why is it normalized?
Response time $\tau$ measures the elapsed time in milliseconds between the incoming bid and the most recent bid by a *different* bidder on that specific auction. It is normalized because raw response times vary widely between human bidders (seconds/minutes) and automated shill bots (milliseconds). Normalized parameters help the classifier easily identify sub-second anomalies.

#### Q12. How does the Bid Frequency ($\phi$) feature assist in identifying multi-auction shill accounts?
Shill accounts operated by a seller are often deployed across several active listings simultaneously to drive up margins. Bid Frequency measures the bidder's global bid rate (bids per minute) across all active auctions in the sliding window. A disproportionately high frequency points to a script actively coordinating price inflation.

#### Q13. Explain the Increment Ratio ($\rho$). How does a shill bot typically behave regarding this feature?
The Increment Ratio is the actual bid increment divided by the auction's minimum required increment ($\Delta_{\text{bid}} / \Delta_{\text{min}}$). Shill bots typically bid exactly the minimum increment ($\rho \approx 1.0$) to drive up the price gradually and minimize the risk of accidentally outbidding themselves or ending up as the winner if no legitimate buyers bid.

#### Q14. What does the Seller Co-occurrence ($\sigma$) feature measure, and why is it the defining pattern of shill bidding?
It measures the number of distinct auctions created by the *same* seller in which a specific bidder has participated within the sliding window. Because a shill account is economically tied to a specific seller, the account will repeatedly appear in that seller's listings, creating a high co-occurrence score that legitimate, unrelated buyers rarely exhibit.

#### Q15. Define the Reciprocity ($\gamma$) feature mathematically.
Reciprocity measures mutual outbidding within a specific auction. For a directed bid graph, it is calculated as the ratio of reciprocal outbid edges (Bidder A outbids Bidder B, and Bidder B outbids Bidder A) to the total outbid edges in the window. A high ratio indicates a circular outbidding loop typical of collusion.

#### Q16. Why is the Reciprocity feature considered the dominant signal in the classifier?
Ablation testing shows that removing Reciprocity causes the F1 score to collapse to 0.000. This occurs because while individual bot-like response times can be mimicked by snipers, the mutual, repetitive outbidding cycle between a shill and a legitimate buyer (or a collusion ring) is structurally unique to price inflation.

#### Q17. How does your sliding-window graph handle high-volume auctions without running out of memory?
By enforcing a strict sliding window limit ($W = 30$ minutes) and lazy pruning. Because only active bidders and current bids are stored, memory usage remains bound to active concurrent bids, rather than growing infinitely with the entire history of the platform.

#### Q18. What is the time complexity of inserting a bid and extracting the feature vector?
Both operations execute in $O(1)$ amortized time. Bid insertion is a hash map append, lazy pruning removes only expired edges during insertion, and feature extractions rely on pre-aggregated local counters maintained incrementally at the node level.

#### Q19. How do you prevent features from being manipulated by "timing jitter" introduced by sophisticated bots?
While shill bots can inject randomized delay (jitter) to lower their Response Time ($\tau$) score, they cannot easily alter their global Bid Frequency ($\phi$), Seller Co-occurrence ($\sigma$), or structural Reciprocity ($\gamma$) without failing their primary objective of inflating prices within the active window.

#### Q20. Can a legitimate "sniper" (user bidding in the last seconds) be falsely flagged as a shill?
A sniper will exhibit a low Response Time ($\tau$) and a high Increment Ratio ($\rho \approx 1.0$), which mimics bot behavior. However, because they bid on unrelated sellers and do not participate in reciprocal outbidding loops over the sliding window, their low Seller Co-occurrence ($\sigma$) and Reciprocity ($\gamma$) scores keep their overall fraud probability below the classification threshold.

---

### Category 3: Machine Learning Model and Classifier (Q21–Q28)

#### Q21. Why did you choose Logistic Regression instead of more complex models like Random Forests, XGBoost, or deep neural networks?
Logistic Regression is mathematically simple, highly interpretable, has zero external dependencies, and runs in sub-milliseconds. Complex models like XGBoost would require a Python sidecar, introducing IPC latency and serialization overhead, which violates our real-time streaming constraint.

#### Q22. How are the five streaming features preprocessed before entering the classifier?
They are z-scored: $z_i = (x_i - \mu_i) / \sigma_i$. The normalization parameters (mean $\mu_i$ and standard deviation $\sigma_i$) are calculated offline from 50 training runs generated by our simulator. This scales features to a uniform distribution, preventing features with large raw values (like response time in milliseconds) from dominating the model.

#### Q23. Explain the negative weight for the Response Time ($\tau$) feature ($\beta_1 = -1.8$).
The negative weight means that as the raw response time decreases, the probability of fraud increases. Since bots respond almost instantaneously, a very low response time (e.g., 100ms) yields a highly negative raw value which, when multiplied by a negative coefficient, increases the overall log-odds of fraud.

#### Q24. How is the decision threshold set to $\theta = 0.05$? Isn't 0.05 unusually low?
The decision threshold is set to 0.05 to intentionally prioritize **Recall** over Precision. In fraud detection, a False Negative (missing a shill bidder) is far more damaging to the platform's integrity than a False Positive (flagging a legitimate user for admin review). A threshold of 0.05 catches all fraudsters ($Recall = 1.0$) while maintaining a strong Precision of 0.864.

#### Q25. What is the mathematical formulation of the Logistic Regression classifier?
The probability is calculated using the sigmoid function:
$$P(\text{shill} | \mathbf{z}) = \frac{1}{1 + e^{-(\beta_0 + \sum_{i=1}^{5} \beta_i z_i)}}$$
where $\beta_0$ is the intercept, and $z_i$ represents the z-scored streaming features.

#### Q26. How does your classifier handle "explainability" for the system administrators?
Because the model uses Logistic Regression, the contribution of each feature to the final score is additive. When a bid is flagged, the engine identifies the specific features that contributed most heavily to exceeding the threshold and constructs a natural-language reason string detailing the exact metric (e.g., "response time of 142ms").

#### Q27. What would happen if a shill bidder learned your weights ($\beta$)? How could they bypass the system?
If they learned the weights, they could try to bypass the system by spacing their bids to increase Response Time ($\tau$) or bidding varying amounts to increase the Increment Ratio ($\rho$). However, doing so reduces their efficiency at driving up prices and does not protect them from being caught by the structural co-occurrence ($\sigma$) and reciprocity ($\gamma$) metrics.

#### Q28. How would you update the classifier's weights as new fraud patterns emerge in production?
We can apply **Online Gradient Descent** (online weight adaptation). Instead of retraining the model in batches offline, the weights can be adjusted incrementally using a small learning rate whenever an administrator confirms a flag (true positive) or dismisses it (false positive), allowing the system to co-evolve with new fraud strategies.

---

### Category 4: Synthetic Evaluation Framework and Personas (Q29–Q35)

#### Q29. Why did you build a synthetic simulator instead of evaluating on real-world eBay data?
Real-world eBay data lacks ground-truth labels. We cannot know with absolute certainty which historical bids were placed by shills and which were legitimate. The synthetic simulator allows us to define agent behaviors precisely, granting us perfect ground-truth labels (`isShill=true/false`) for scientific evaluation.

#### Q30. Describe the four agent personas defined in the simulator.
1. **Truthful**: Bids organically up to their private valuation, responding slowly with variable increments.
2. **Sniper**: Remains silent until the final seconds of the auction, then places a single high bid to win without driving up the price.
3. **Shill**: Bids immediately at the minimum increment whenever a truthful user bids, driving up the price to protect the seller's margin.
4. **Collusion Ring**: A group of coordinated bidder agents that mutually outbid each other to rapidly drive up the auction price.

#### Q31. What is the baseline outbid-count heuristic used in Table I, and why does it fail ($F1 = 0.000$)?
The baseline heuristic flags any bidder who has outbid someone more than 10 times (`count(OUTBID) > 10`). In our 60-second simulation runs, the rapid pace and short duration mean that shill bids are placed quickly but rarely exceed 10 total outbids per agent, resulting in zero flags ($Recall=0$, $F1=0$). The heuristic fails because it is static and does not account for temporal or relational signals.

#### Q32. Explain the results of the Feature Ablation study (Table II).
Table II shows that removing any individual feature reduces the model's F1 score. Removing Response Time ($\tau$), Bid Frequency ($\phi$), or Increment Ratio ($\rho$) drops F1 from 0.927 to 0.872. Removing Seller Co-occurrence ($\sigma$) drops F1 to 0.788. Crucially, removing Reciprocity ($\gamma$) drops F1 to 0.000, proving that mutual outbidding is the core structural signal of shill bidding.

#### Q33. What are the primary threats to the validity of your synthetic evaluation?
1. **Idealized Behavior**: Real-world human fraudsters do not follow perfect, rigid rules and may randomize their increments or timing.
2. **Class Imbalance**: In production, shill bidding is rare, whereas the simulator seeds a highly concentrated fraud environment (2 out of 6 agents are fraudulent).
3. **Single Listing**: The evaluation measures one active auction in isolation; a real platform runs thousands of concurrent auctions.

#### Q34. How did you calibrate the simulator to ensure the synthetic bids resemble human behavior?
We analyzed baseline public eBay bid history logs to estimate realistic boundaries for minimum increment distributions, bidding intervals (human response delays of several hours vs. bot delays of milliseconds), and sniper timing windows, using these distributions to seed our Truthful and Sniper agent personas.

#### Q35. Why does Table II show that the recall remains 1.000 even when removing F1, F2, or F3?
Because the structural features—Seller Co-occurrence ($\sigma$) and Reciprocity ($\gamma$)—are so strong that even without timing signals, they are sufficient to identify the shill and collusion agents. However, removing F1, F2, or F3 reduces precision, as the model begins to misclassify rapid legitimate snipers.

---

### Category 5: Sealed-Bid Cryptographic Commit-Reveal Protocol (Q36–Q42)

#### Q36. What is the security objective of the W1 Commit-Reveal Sealed-Bid protocol?
The objective is to prevent **bid leakage**. In a standard sealed-bid auction, the database administrator or an attacker who compromises the backend server can inspect the bids during the live phase, allowing them to leak bid amounts to a favored bidder or place a shill bid just below the highest bid.

#### Q37. Explain the mathematical steps of the W1 commitment phase.
During the active phase, the bidder chooses their bid amount ($a$) and generates a random string called a nonce ($n$). They compute a SHA-256 hash commitment:
$$H = \text{SHA-256}(\text{amountHex} \parallel \text{:} \parallel \text{nonce})$$
They submit only $H$ to the server. The server stores $H$ but learns nothing about the actual bid amount $a$.

#### Q38. Explain the reveal phase of the W1 protocol.
After the bidding phase closes, the reveal phase begins. Bidders must submit their raw bid amount ($a$) and their nonce ($n$) to the server. The server computes $\text{SHA-256}(a \parallel \text{:} \parallel n)$ and compares it to the stored commitment $H$. If they match, the bid is verified and entered into the auction ledger.

#### Q39. Define the "Hiding" and "Binding" properties of the SHA-256 commitment function.
*   **Hiding**: Because SHA-256 is a one-way cryptographic hash function, it is computationally infeasible to determine the original bid amount $a$ from the hash $H$.
*   **Binding**: Because SHA-256 is collision-resistant, a bidder cannot find a different bid amount $a$' and nonce $n'$ that hash to the same commitment $H$. They are strictly locked into their committed bid amount.

#### Q40. What is the main limitation of your W1 protocol?
The main limitation is that the server **cannot validate bids during the active phase**. For example, it cannot verify if a bidder's committed amount is greater than the required reserve price, or if the bidder actually has sufficient funds in their wallet, without forcing them to reveal the bid early.

#### Q41. How can this limitation be solved in a production deployment?
By utilizing **Pedersen Commitments** with **Bulletproof Range Proofs**. This cryptographic approach allows a bidder to submit a commitment along with a zero-knowledge proof proving that their bid is within a specific range (e.g., $\text{bid} \geq \text{reservePrice}$) without revealing the actual bid amount to the server.

#### Q42. What happens if a bidder commits a bid but refuses or fails to submit their reveal during the reveal phase?
The platform treats their bid as invalid and voids it. To prevent bidders from strategically withholding their reveals (e.g., realizing they don't want to win after seeing low market interest), platforms typically implement a financial penalty, such as locking and slashing a portion of the bidder's wallet deposit held during the commitment phase.

---

### Category 6: Concurrency and the Redis Stream Sequencer (Q43–Q47)

#### Q43. What is database row lock contention, and why does it occur in high-volume auction platforms?
During popular auctions (especially in the final seconds), hundreds of concurrent bidders submit bids. To prevent race conditions, the backend must lock the target auction row (`SELECT ... FOR UPDATE`). This forces all concurrent requests to queue up in the database transaction manager, leading to high response latencies, connection timeouts, and database exhaustion.

#### Q44. How does the Redis Stream Sequencer (W2) solve this database row lock contention?
Instead of executing transactions directly on PostgreSQL, concurrent bids are immediately enqueued into a dedicated FIFO **Redis Stream** (taking <1ms). A single-threaded background consumer (powered by BullMQ) reads bids from the stream and writes them to PostgreSQL sequentially. Because only one process updates the database at a time, Postgres row locks are always uncontested, eliminating transaction queuing.

#### Q45. Explain the throughput and latency results shown in Table III.
Table III shows that at 1 concurrent bidder, both systems perform similarly (236ms for row locking vs. 134ms for Redis). However, under a high load of 100 concurrent bidders, direct row locking degrades severely to a p50 latency of **5,772ms** due to lock contention. The Redis Stream sequencer maintains a p50 latency of just **8.1ms**—representing a 10x p99 latency reduction and a 32.5x throughput improvement.

#### Q46. Does the Redis Stream sequencer guarantee "at-least-once" delivery? How?
Yes, it utilizes Redis Stream consumer groups with explicit acknowledgments (ACKs) and BullMQ job states. If the background consumer crashes mid-transaction, the bid remains in the stream's Pending Entry List (PEL). Upon recovery, the worker re-claims the unacknowledged bid, executing it again to guarantee that no bids are lost.

#### Q47. How do you maintain real-time UI updates when using an asynchronous background sequencer?
Once the seeder or consumer successfully processes a bid from the Redis Stream and commits it to PostgreSQL, the backend immediately emits a Socket.io WebSocket event (`bid:placed`) to all connected clients, allowing the frontend React dashboard to update the current price and bid history in real time.

---

### Category 7: Limitations, Threats, and Future Extensions (Q48–Q50)

#### Q48. What are the main limitations of your proposed architecture?
1. **LR Weights Calibration**: The Logistic Regression weights are static and hand-tuned from a small synthetic dataset.
2. **Pedersen Range Proofs**: The sealed-bid protocol lacks zero-knowledge range validations.
3. **Horizontal Scalability**: The Redis Stream background consumer is currently single-threaded and single-instance; scaling horizontally requires partitioning streams by auction ID to maintain strict message ordering.

#### Q49. How would you horizontally scale the Redis Stream consumer group in a global deployment?
We can partition the Redis Streams by hashing the `auctionId` (similar to Kafka partitions). Each consumer instance is assigned a unique subset of partitions. This guarantees that bids for any *specific* auction are processed sequentially in a single thread to prevent race conditions, while bids across *different* auctions are processed in parallel across multiple machines.

#### Q50. If you could add one major feature to this research project next, what would it be and why?
Implementing **Online Weight Adaptation using Stochastic Gradient Descent (SGD)**. This allows the Logistic Regression classifier to update its weights dynamically in memory in response to real-time administrative feedback, enabling the platform to auto-detect and adapt to highly sophisticated, randomized shill bot behaviors without requiring offline retraining cycles.

---

### Part 3: Quick-Fire "Defense" Cheat Sheet

If the examiner fires a challenging question, use this structural alignment to defend your work:

*   **To defend Logistic Regression simplicity:** *"Our system runs inline with the critical write path. We trade the marginal accuracy gains of deep models for sub-millisecond in-process latency, total mathematical interpretability, and clear inline feature explanations for administrators."*
*   **To defend Synthetic Data:** *"While real-world data is ideal, public auction datasets (like eBay dumps) lack absolute ground-truth fraud labels. Synthetic simulation is the only way to scientifically measure precision and recall against verified agent behaviors."*
*   **To defend Sealed-Bid lack of range proofs:** *"Our W1 protocol is designed to be highly lightweight. While Pedersen commitments solve active-phase validation, they introduce significant cryptographic overhead. We explicitly identify this computational tradeoff and defer homomorphic range proofs to future work."*
*   **To defend single-instance Redis Sequencer:** *"The Redis sequencer operates on the event-sourcing principle. By serializing writes at the ingress, we eliminate database lock managers. For horizontal scaling, we outline an auction-ID partition scheme to maintain strict temporal ordering across distributed workers."*
