# Chapter 18 — The Literature Review

## Why This Chapter Exists

A research paper is not written in a vacuum. Every paper claims to build on prior work, fill a gap that others left open, or solve a problem that others solved differently. The "related work" and "literature survey" sections of our papers exist to place our contribution in the context of what already exists.

This chapter explains every paper in our bibliography in plain language — what it actually did, what it claimed to prove, and why it matters to AuctionHaus.

---

## Auction Theory Foundations

### Vickrey (1961) — "Counterspeculation, Auctions, and Competitive Sealed Tenders"

**Journal:** Journal of Finance, 1961  
**Author:** William Vickrey (Nobel laureate)

**What it says:** Vickrey proved that in a second-price sealed-bid auction (where the highest bidder wins but pays the second-highest price), the dominant strategy for every bidder is to bid their true valuation. This is called "incentive compatibility" — the auction mechanism does not reward strategic misrepresentation.

He also analysed English auctions with proxy bidding. When proxies are used, the equilibrium price is `P* = min(M₁, M₂ + δ)` where M₁ is the highest max, M₂ is the second highest, and δ is the minimum increment. The winner pays just enough to beat the runner-up — not their full maximum.

**Why it matters to us:** The "Vickrey equivalence" of our atomic ladder protocol is named after this result. We prove (Theorem 2 in the ladder paper) that our protocol produces exactly this equilibrium price. This is the formal justification for why per-increment logging is not just a UX choice — it produces a theoretically sound outcome.

### Roth & Ockenfels (2002) — "Last-Minute Bidding and the Rules for Ending Second-Price Auctions"

**What it says:** Analysed "sniping" behaviour (bidding at the last second) in eBay auctions vs. Amazon auctions (which had a rolling extension mechanism). Found that sniping was much more common on eBay (hard deadline) than Amazon (soft deadline with extension). Sniping on eBay could be a rational strategy: by bidding at the last moment, you prevent rivals from counter-bidding.

**Why it matters to us:** This is the academic context for our anti-sniping mechanism. If we extended the deadline by 5 minutes on any late bid, we are implementing the "Amazon rule" that Roth & Ockenfels identified as reducing sniping. The anti-snipe extension is not just a UX feature — it is a mechanism that moves the auction closer to the theoretical equilibrium.

---

## Fraud Detection Foundations

### Trevathan & Read (2007) — "Detecting Shill Bidding in Online Auctions"

**Where:** Multiple publications (workshop proceedings, IEEE CEC)  
**Key paper:** "Detecting Shill Bidding in Online English Auctions", IEEE International Conference on e-Business

**What it says:** The first formal definition of shill bidding for computer science. Introduced a "shill score" combining multiple signals from complete auction histories:
- Bid retraction rate (how often does this bidder withdraw bids?)
- Successive outbidding (does the bidder keep getting outbid by the same person?)
- Winning bid ratio (what fraction of this bidder's bids result in wins?)
- Auction bids ratio (how many bids relative to the number of auctions participated in?)

A high shill score flags a user as potentially fraudulent.

**Limitation:** Requires the complete auction history. Cannot be computed while the auction is live.

**How we extend it:** We compute features over a sliding 30-minute window rather than a complete history. Our τ (response time) and ρ (increment ratio) features overlap with Trevathan & Read's indicators, but our system produces scores in real time rather than post-hoc.

### Ford, Xu & Valova (2010) — "Shill Bidding in English Auction"

**Where:** Australian Information Security Management Conference

**What it says:** Built a bidder-seller co-occurrence bipartite graph: one type of node is bidders, another is sellers, edges are auction transactions. Used graph metrics (degree centrality, betweenness) to identify bidders who are closely connected to one seller — the signature of a shill account.

Reported 0.84 precision on a labelled eBay dataset.

**Limitation:** The graph is built from completed auction data. It is a batch analysis, not a streaming one.

**How we extend it:** Our σ (seller co-occurrence) feature is directly inspired by this work. We compute the seller co-occurrence in real time from the sliding-window graph, not from completed auction dumps.

### Tsang, Koh & Dobbie (2014) — Community Detection on Auction Graphs

**What it says:** Applied modularity-maximisation (Newman-Girvan community detection algorithm) to transaction graphs from completed auctions. Bidder-seller clusters that are unusually tightly connected suggest fraud rings. Required at least 3 completed auctions for the graph to be meaningful.

**Limitation:** Batch, post-hoc, requires multiple completed auctions.

**How we extend it:** Our γ (reciprocity) feature captures the "tight cluster" signal in real time — within a single auction, pairs of bidders who mutually outbid each other repeatedly form a miniature "collusion community." We do not need multiple completed auctions.

### Pandit, Chau, Wang & Faloutsos (2007) — NetProbe

**Where:** WWW 2007 (highly cited)

**What it says:** Proposed "NetProbe," which runs loopy belief propagation (a message-passing algorithm from graphical models) over an eBay transaction graph. Nodes are labelled as honest, fraudulent, or accomplice based on neighbourhood relationships. Achieved high accuracy on a labelled dataset.

**Limitation:** Batch job on a static graph snapshot.

**Why we cite it:** NetProbe is the canonical reference for graph-based auction fraud detection. Our use of a bid graph (though much simpler) connects to this line of work.

### Akoglu, Tong & Koutra (2015) — Graph-Based Anomaly Detection Survey

**Where:** Data Mining and Knowledge Discovery journal

**What it says:** A comprehensive survey of graph anomaly detection methods: static graph anomalies, dynamic graph changes, spectral methods, community-structure approaches. Discusses feature-based methods that compute local node characteristics (degree, clustering coefficient, etc.) and use them as anomaly scores.

**Why we cite it:** Provides the academic vocabulary for what we are doing: feature-based anomaly detection on a dynamic graph. Our five features are effectively "local node characteristics" in the bid graph.

### Phua, Lee, Smith & Gayler (2010) — Fraud Detection Survey

**Where:** SIGKDD Explorations

**What it says:** A comprehensive survey of fraud detection across credit cards, insurance, and online auctions. Classifies methods as supervised, semi-supervised, and unsupervised. Notes that supervised methods require labelled training data; unsupervised detect anomalies without labels.

**Why we cite it:** Our system is supervised (we have ground-truth shill labels from the simulator). This survey provides the taxonomic context.

### Sadaoui & Wang (2017) — Stage-Based Fraud Monitor

**What it says:** The only paper we found that attempted real-time fraud detection in auction settings. Used a stage-based monitor that updates scores as bids come in across several auctions simultaneously, emitting alerts when a bidder's running score crosses a threshold.

**Limitation:** Still periodic batches — re-scores all active bids every N seconds rather than on every individual bid.

**How we extend it:** We process every individual bid as it arrives (per-bid, not periodic). Our overhead is under 1ms per bid, which allows continuous processing without any periodic batch step.

---

## Cryptography References

### Brandt (2006) — Commitment Schemes for Auctions

**What it says:** Surveys commitment schemes and zero-knowledge proof systems for sealed-bid auctions. Evaluates SHA-based commitments (hiding, binding), Pedersen commitments (additionally supports homomorphic operations), and Damgård-Fujisaki commitments (supports range proofs without trusted setup).

**Why we cite it:** Directly inspires our SHA-256 commitment scheme. The paper also motivates why Pedersen + Bulletproofs would be better (range proof support) — our acknowledged limitation.

### Bünz, Bootle, Boneh, Poelstra, Wuille & Maxwell (2018) — Bulletproofs

**What it says:** A system for generating logarithmic-size range proofs — zero-knowledge proofs that a value lies in a range [0, 2^n] without revealing the value. Unlike prior ZK proof systems (Groth16), Bulletproofs require no trusted setup and are more practical.

**Why we cite it:** Future work. Our commit-reveal scheme cannot prove `amount ≥ reservePrice` without revealing the amount. Bulletproofs + Pedersen commitments would allow range proofs while preserving hiding. Cited as the specific construction we would use.

---

## Systems References

### Kleppmann (2017) — "Designing Data-Intensive Applications"

**What it says:** A textbook on event-sourcing, distributed databases, stream processing. The log-structured approach (immutable append-only log as the source of truth, with derived views) is presented as the principled way to build systems that need consistency under failure.

**Why we cite it:** Our Redis Stream sequencer is a direct application of the event-log principle: bids are appended to an immutable log (the Redis Stream), and the database is a derived view (bids processed by the consumer). The "at-least-once delivery" + consumer group acknowledgement is the log-based delivery guarantee Kleppmann describes.

### Gray & Reuter (1992) — "Transaction Processing: Concepts and Techniques"

**What it says:** The definitive textbook on transaction processing. Covers ACID properties, locking protocols, isolation levels, deadlock prevention (the resource ordering theorem), and recovery.

**Why we cite it:** The two-tier lock ordering policy (auction first, wallets by userId) is a direct application of the "resource ordering" deadlock prevention technique described in Gray & Reuter. When proving deadlock freedom in the ladder paper, we cite this as the authoritative source for the technique.

---

## The Research Gap We Fill

After surveying all this literature, the gap is clear:

**Every prior detection system for shill bidding operates on completed auction logs.** None score individual bids in real time during an active auction. None can alert an administrator to intervene while the fraud is happening.

The closest is Sadaoui & Wang (2017), but they use periodic re-scoring (every N seconds) rather than per-bid streaming.

**Our contribution** is a per-bid streaming detector that:
- Processes each bid in under 1ms (no measurable latency to the bid path)
- Uses a sliding-window graph so features are always current (not stale post-hoc)
- Produces a real-time flag with an explanation
- Enables immediate admin action while the auction is live

This is a defensible research novelty. Not revolutionary, but genuinely incremental — taking a well-studied problem (shill detection) and solving a specific, previously-unaddressed variant (real-time, per-bid, in-process).

---

## Next Chapter

Chapter 19 covers deployment — how to actually run AuctionHaus, the Docker Compose setup, the demo seeder, and the 3-minute demo script.
