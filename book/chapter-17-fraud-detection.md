# Chapter 11 — Real-Time Fraud Detection

## What Is Shill Bidding?

Imagine you are selling your old laptop on an auction site. The starting price is ₹10,000. You have a friend create a fake account and place bids against real buyers, driving the price up to ₹25,000 before a genuine buyer "wins." Your friend never intended to actually pay. The genuine buyer pays ₹25,000 for a laptop worth ₹15,000. You got ₹10,000 more than you deserved.

This is shill bidding. It is illegal in most jurisdictions, banned by every large auction platform, and profitable enough that it still happens constantly.

The defining characteristic of shill bidding is that the shill bidder (your friend) is **colluding with the seller**. They are not actually competing — they are performing a script to inflate the price.

---

## Why Existing Detection Fails

Every paper in the academic literature we could find has the same limitation: detection happens **after the auction ends**.

Trevathan and Read (2007) — the foundational paper — compute a "shill score" from the complete auction history: how many times did this bidder win nothing despite bidding repeatedly? How often did they bid just above the minimum increment? These are meaningful signals, but you can only compute them once the auction is over and all the data is in.

Ford, Xu, and Valova (2010) build a bidder-seller co-occurrence graph after each auction closes, running community detection to find clusters of shill accounts tied to a seller.

Tsang, Koh, and Dobbie (2014) run modularity-maximisation community detection on complete transaction dumps.

All retrospective. None can flag a suspicious bid while the auction is still live. An admin might review the post-hoc scores the next morning, but the shill bidder has already done their damage.

**Our contribution:** a system that flags every suspicious bid within milliseconds, during the auction, with enough context for an admin to act immediately.

---

## Architecture: The FraudEngine

The FraudEngine is a singleton that lives in the Express process. It is initialised during server startup after Socket.io is ready (because flagging emits socket events):

```typescript
// back/src/index.ts
const fraudEngine = new FraudEngine(io);
```

The engine has two responsibilities:
1. Maintain a sliding-window bid graph updated on every bid
2. Score each bid and emit flags for suspicious ones

Every bid goes through the engine after its transaction commits:

```typescript
// bid.service.ts, after transaction
fraudEngine.observe({
  bidderId: bid.bidderId,
  auctionId: bid.auctionId,
  sellerId: auction.sellerId,
  amount: toNum(bid.amount),
  minIncrement: toNum(auction.minIncrement),
  ts: Date.now()
});
```

This is fire-and-forget. The bid response is sent before the fraud check finishes. The fraud check adds zero latency to the bid path from the user's perspective.

---

## The Sliding-Window Bid Graph

### Concept

Think of the bid graph as a short-term memory for the fraud engine. It remembers every bid placed in the last 30 minutes. Older bids are forgotten. This prevents the graph from growing unboundedly and keeps features relevant — a bidder's suspicious behaviour from 3 months ago is less interesting than their behaviour in the last 30 minutes.

### Data Structures

```typescript
class BidGraph {
  private windowMs = 30 * 60 * 1000;  // 30 minutes

  // All bids per auction, per bidder
  private auctionBids = new Map<auctionId, Map<bidderId, BidEvent[]>>();
  
  // All bids per bidder across all auctions
  private bidderBids = new Map<bidderId, BidEvent[]>();
  
  // How many unique sellers this bidder has bid with
  private bidderSellerMap = new Map<bidderId, Map<sellerId, number>>();
}
```

### Lazy Pruning

The graph does not run a background timer to prune old entries. Instead, pruning happens when new entries are inserted: old events beyond the window are removed from the array before the new one is appended.

```typescript
addBid(event: BidEvent): void {
  const cutoff = event.ts - this.windowMs;
  
  // Prune old entries for this bidder
  const bidderHistory = this.bidderBids.get(event.bidderId) ?? [];
  const pruned = bidderHistory.filter(e => e.ts > cutoff);
  pruned.push(event);
  this.bidderBids.set(event.bidderId, pruned);
  
  // Similarly for auction-specific and seller-cooccurrence maps
  // ...
}
```

Why lazy? Because bidding activity is bursty. During an active auction, bids arrive frequently. During quiet periods, nothing happens. A timer-based pruner would fire every few seconds during quiet periods, doing nothing useful. Lazy pruning touches data only when it is accessed, keeping the work proportional to the actual bid rate.

---

## The Five Features

For each bid event `e = (bidder, auction, seller, amount, ts)`, five features are computed from the graph.

### F1 — Response Time (τ)

**What it measures:** How quickly this bidder replied after the previous bid on the same auction.

**Formula:** `τ = e.ts - lastBidTimestamp(e.auctionId)` in milliseconds. For the first bid on an auction, `τ = 0`.

**Why it flags fraud:** Human bidders typically take at least a few seconds to notice a bid and decide to respond. A response in under 500ms is almost certainly automated. Shill bots respond immediately after a legitimate bidder to maintain price pressure.

**Weight in classifier:** Negative (`-0.2332`). A very short response time (sub-500ms) increases the fraud score. A long response time decreases it.

### F2 — Bid Frequency (φ)

**What it measures:** How many bids this bidder has placed across all auctions in the last 30 minutes, normalised to bids per minute.

**Formula:** `φ = count(bidder events in window) / windowMinutes`

**Why it flags fraud:** A genuine human bidder focuses on one or two auctions at a time. A shill account might simultaneously inflate many auctions for the same seller — high bid frequency across multiple auctions within the window.

**Weight:** Negative (`-0.5218`). Higher frequency = higher fraud score (the feature value is inverted by the negative weight after z-scoring — low raw value becomes high z-score).

### F3 — Increment Ratio (ρ)

**What it measures:** How much this bidder increments above the minimum. Calculated as `bid amount / minIncrement`.

**Formula:** `ρ = e.amount / e.minIncrement`

**Why it flags fraud:** Shill bots are scripted to raise the price as slowly as possible — each bid is exactly `minIncrement` above the current price. A ratio close to 1.0 across multiple bids suggests scripted behaviour. A genuine eager bidder might bid significantly more than the minimum.

**Weight:** Near-zero (`0.01`). This feature alone is weak — legitimate careful bidders also increment minimally. It contributes only weakly to the score.

### F4 — Seller Co-occurrence (σ)

**What it measures:** How many distinct auctions from the same seller this bidder has participated in during the window.

**Formula:** `σ = count(distinct sellers mapped to this bidder in window)` — actually, it's the count of same-seller auctions the bidder has appeared in, divided by some normalization.

**Why it flags fraud:** A shill account is always associated with ONE seller. If a bidder appears in 4 different auctions all run by the same seller within 30 minutes, that is a strong signal of collusion. A genuine bidder might bid on auctions from many different sellers.

**Weight:** Strongest positive weight (`2.5006`). This is the dominant feature. The ablation study (Chapter 12) confirms: removing this feature drops F1 from 1.000 to 0.105.

### F5 — Reciprocity (γ)

**What it measures:** What fraction of bidder pairs on the auction keep outbidding each other mutually.

**Formula:** For bidders A, B, C on the auction — look at all pairs (A,B), (A,C), (B,C). For each pair, check if they have outbid each other at least twice. `γ = count(mutually-outbidding pairs) / count(total pairs)`.

**Why it flags fraud:** A collusion ring involves two or more fake bidders taking turns bidding against each other to drive the price up. They outbid each other repeatedly. The reciprocity score captures this pattern.

**Weight:** Negative (`-0.2408`). High reciprocity = high fraud score.

---

## The Logistic Regression Classifier

### Z-Score Normalization

Raw feature values have very different scales. Response time is in milliseconds (range 0–30,000). Seller co-occurrence is a count (range 0–10). If we use raw values, a large response time would numerically dominate the calculation just because of its magnitude, not its actual importance.

Z-score normalization scales each feature to have mean=0 and std=1:

```
z = (feature_value - mean) / std
```

Where mean and std are computed from the training data. After z-scoring, every feature is on the same scale. A value of +2 means "two standard deviations above average" regardless of what unit the original feature was in.

The normalization parameters in `fraud.classifier.ts`:
```
responseTimeMs:      mean=6519ms, std=5225ms
bidFrequencyPerMin:  mean=0.178,  std=0.127
incrementRatio:      mean=1.32,   std=0.92
reciprocityScore:    mean=0.43,   std=0.36
sellerCoOccurrence:  mean=2.30,   std=0.92
```

These are clamped to [-4, 4] to prevent extreme outliers from overwhelming the classifier.

### The Classification Formula

```
logit = β₀ + β₁·z₁ + β₂·z₂ + β₃·z₃ + β₄·z₄ + β₅·z₅

P(shill | z) = sigmoid(logit) = 1 / (1 + e^(-logit))
```

Where:
- `β₀ = 2.7951` (intercept — the prior probability of a bid being shill-related)
- `β₁ = -0.2332` (responseTimeMs)
- `β₂ = -0.5218` (bidFrequencyPerMin)
- `β₃ = 0.01`   (incrementRatio)
- `β₄ = -0.2408` (reciprocityScore)
- `β₅ = 2.5006` (sellerCoOccurrence — the dominant feature)

A bid is flagged if `P > 0.5` (the default LR decision boundary).

Why are some weights negative? Because the z-score inversion: a short response time has a very negative z-score (it is far below the mean response time). Multiplying by a negative weight gives a positive contribution to the fraud score. So `β₁ = -0.2332` means "a short response time (low z₁) contributes positively to fraud probability."

### Explainability

Every flag includes a human-readable reason string:

```typescript
// If response time is under 500ms and > 0: "response time 142ms (bot-speed)"
// If bid frequency > 2/min: "3.4 bids/min (high frequency)"
// If increment ratio < 1.5: "increment x1.03 (minimum-increment scripting)"
// If seller co-occurrence >= 3: "4 auctions with same seller (co-occurrence)"
// If reciprocity > 0.3: "reciprocity 87% (collusion ring)"
```

The admin sees not just a score but an explanation. "response time 142ms (bot-speed); 4 auctions with same seller (co-occurrence)" tells the admin immediately why this bid was flagged and what to look for in the user's history.

---

## The Admin Fraud Dashboard

The `/admin/fraud` page is the live view of the fraud engine's output.

### Live Feed

A scrolling inbox of `fraud:flag` socket events. Each entry shows:
- Bidder name + avatar
- Auction title + link
- Score as a coloured badge (green below 0.3, amber 0.3–0.7, red above 0.7)
- Feature bars: visual bars for each feature's value, flagged bars highlighted in red
- Reason string
- Dismiss button

### Top-Flagged Bidders

A leaderboard showing which users have been flagged most often. Useful for spotting persistent shill accounts that operate across multiple auctions.

### Detector Status

An indicator showing whether the FraudEngine is initialised and receiving bids. Shows "Online" (green) when the engine is active, "Offline" when it is not.

### Admin Actions

From the fraud dashboard, admins can:
- Dismiss a flag (mark as false positive)
- Suspend a bidder directly (one click from the fraud inbox)

---

## Performance

The fraud check runs in under a millisecond per bid. A `LatencyRing` in the FraudEngine tracks a rolling sample of 1024 measurements:

```typescript
const start = performance.now();
// ... extract features, score, emit
const elapsed = performance.now() - start;
latencyRing.push(elapsed);
```

This backs the paper's claim that the fraud check adds no measurable latency to the user's experience. The `GET /api/fraud/perf` admin endpoint returns the ring's p50, p95, p99, and mean.

---

## Next Chapter

Chapter 12 explains how we generated training data for the classifier — the synthetic simulator, the four agent personas, and the evaluation pipeline that computes precision, recall, F1, and the ROC curve.
