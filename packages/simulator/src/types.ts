export type AgentType = 'truthful' | 'sniper' | 'shill' | 'collusion';

export interface AgentConfig {
  type: AgentType;
  /** email/password used to authenticate against the backend */
  email: string;
  password: string;
  /** collusionPartnerId: only set for 'collusion' agents (they know each other) */
  collusionPartnerId?: string;
}

export interface SimulationConfig {
  /** Number of auctions to create and run */
  auctionCount: number;
  /** Agents to spawn for each auction */
  agents: AgentConfig[];
  /** Duration of each auction in seconds */
  auctionDurationSec: number;
  /** Starting price */
  startingPrice: number;
  /** Minimum bid increment */
  minIncrement: number;
  /** Backend base URL */
  backendUrl: string;
}

export interface BidLogEntry {
  ts: number;
  auctionId: string;
  bidderId: string;
  amount: number;
  agentType: AgentType;
  /** Ground-truth label for evaluation */
  isShill: boolean;
}

export interface SimRunManifest {
  runId: string;
  startedAt: string;
  endedAt: string;
  config: SimulationConfig;
  auctionIds: string[];
  agentMap: Record<string, { userId: string; agentType: AgentType }>;
  /**
   * auctionId -> sellerUserId. Added post-submission to support train.v2.ts
   * (the corrected trainer that resolves seller co-occurrence against the
   * real auction owner instead of the manifest's first truthful agent).
   *
   * Paper-snapshot manifests written before 2026-06-02 do not have this field;
   * the corrected pipeline skips runs missing it (with a console warning)
   * rather than silently picking a fake seller.
   */
  auctionOwners?: Record<string, string>;
  totalBids: number;
  shillBids: number;
}
