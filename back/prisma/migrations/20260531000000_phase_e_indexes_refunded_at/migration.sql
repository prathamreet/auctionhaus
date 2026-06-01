-- Phase E5 + E7 — hot-path indexes and the Bid.refundedAt idempotency marker.
--
-- Order with respect to prior migrations:
--   20260530000000_fraud_commitments (FraudFlag, BidCommitment) came before.
--   This is the next chronological migration. The 20260531000000_ prefix keeps
--   Prisma's folder-name ordering deterministic.

-- ── E7: Bid.refundedAt ─────────────────────────────────────────────────────
-- Idempotency marker for sealed-bid end-of-auction refunds. Nullable on
-- purpose: existing rows carry NULL and are never re-processed because no
-- auction transitions back to ACTIVE. New rows stay NULL until either
-- (a) endAuction's sealed refund block sets them, or (b) they don't apply
-- (English / Dutch -- the column exists but is unused outside the sealed flow).
ALTER TABLE "bids" ADD COLUMN "refundedAt" TIMESTAMP(3);

-- ── E5: hot-path indexes ──────────────────────────────────────────────────
-- Bid history page paginates by createdAt DESC for a given auction. Without
-- this index, the page does a Seq Scan on `bids` followed by a sort. With it,
-- Postgres walks the B-tree backwards.
CREATE INDEX "bids_auctionId_createdAt_idx"
  ON "bids"("auctionId", "createdAt" DESC);

-- processAutoBidLadder loads
--   WHERE auctionId=? AND isActive=true AND bidderId<>?
--   ORDER BY maxAmount DESC, createdAt ASC
-- on every manual bid -- this is the hottest read in the bid pipeline. The
-- composite index covers the first two filter columns and the primary sort.
-- Partial-index alternative (WHERE isActive=true) would be smaller but
-- complicates the planner when we ever query inactive auto-bids for analytics.
CREATE INDEX "auto_bids_auctionId_isActive_maxAmount_idx"
  ON "auto_bids"("auctionId", "isActive", "maxAmount" DESC);
