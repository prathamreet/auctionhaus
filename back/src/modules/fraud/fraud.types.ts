/**
 * Shared types for the real-time fraud detection engine.
 *
 * The engine maintains a sliding-window bid graph in memory, extracts 5
 * features per bid event, scores them with a logistic-regression classifier,
 * and emits `fraud:flag` to the admin socket room for any bid whose score
 * exceeds SCORE_THRESHOLD.
 *
 * Paper contribution: prior work (Trevathan & Read 2007; Ford et al. 2010;
 * Tsang et al. 2014) operates post-hoc on completed auction logs. This engine
 * operates in real-time, during live auctions, and can intervene before the
 * auction closes.
 */

export interface BidEvent {
  bidId: string;
  auctionId: string;
  bidderId: string;
  bidderName: string;
  sellerId: string;
  auctionTitle: string;
  amount: number;
  minIncrement: number;
  /** Unix ms — used for response-time and frequency features. */
  ts: number;
  isAutoBid: boolean;
}

/**
 * Five features extracted per bid event.
 * All values are raw (un-normalised); the classifier normalises before scoring.
 */
export interface FeatureVector {
  /**
   * Time in ms between this bid and the immediately preceding bid on the same
   * auction by a DIFFERENT bidder. Sub-second responses indicate a bot.
   * 0 if this is the first bid.
   */
  responseTimeMs: number;

  /**
   * Bids placed by this bidder across ALL active auctions in the last
   * WINDOW_MINUTES. High frequency is a shill signal.
   */
  bidFrequencyPerMin: number;

  /**
   * bid.amount / auction.minIncrement. A constant ratio across multiple bids
   * indicates scripted increments. Values near 1.0 (minimum-increment bidding)
   * are a strong shill indicator.
   */
  incrementRatio: number;

  /**
   * Number of distinct auctions by the same seller in which this bidder has
   * placed a bid in the last WINDOW_MINUTES. High co-occurrence with a specific
   * seller is the defining shill pattern.
   */
  sellerCoOccurrence: number;

  /**
   * Proportion of pairs (bidder A, bidder B) in this auction that exhibit
   * mutual outbidding (A outbids B AND B outbids A). Range [0, 1]. Values > 0.5
   * suggest a collusion ring.
   */
  reciprocityScore: number;
}

export interface FraudFlagEvent {
  id: string;
  ts: number;
  bidId: string;
  bidderId: string;
  bidderName: string;
  auctionId: string;
  auctionTitle: string;
  amount: number;
  score: number;
  features: FeatureVector;
  reason: string;
}

export interface ClassifierWeights {
  intercept: number;
  responseTimeMs: number;
  bidFrequencyPerMin: number;
  incrementRatio: number;
  sellerCoOccurrence: number;
  reciprocityScore: number;
}

/** Feature normalisation params (mean and std from synthetic training data). */
export interface NormParams {
  mean: FeatureVector;
  std: FeatureVector;
}
