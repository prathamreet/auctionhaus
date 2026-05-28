-- Phase A3: add the indexes that read paths depend on. Without these every
-- catalog load / notifications poll / transaction history page does a
-- sequential scan.
--
-- Order matters: this migration MUST run AFTER 20260528000000_decimal_money
-- (the column-type change is unrelated but Prisma migration ordering is by
-- folder name, so the 20260528000001_ prefix keeps the order deterministic).

-- ── Auction read paths ──
-- Catalog page filters by status / type and orders by endTime. Detail-page
-- end-time queries also benefit.
CREATE INDEX "auctions_status_idx"      ON "auctions"("status");
CREATE INDEX "auctions_endTime_idx"     ON "auctions"("endTime");
CREATE INDEX "auctions_type_status_idx" ON "auctions"("type", "status");

-- ── Bid read paths ──
-- bid.service.getAuctionBids filters by auctionId; placeBid's previous-winner
-- lookup filters by (auctionId, status='WINNING'); user.service.getBidHistory
-- filters by bidderId.
CREATE INDEX "bids_auctionId_status_idx" ON "bids"("auctionId", "status");
CREATE INDEX "bids_bidderId_idx"         ON "bids"("bidderId");

-- ── Notification read paths ──
-- The notifications inbox queries by (userId, isRead) ordered by createdAt.
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- ── Transaction read paths ──
-- Wallet history page paginates by createdAt DESC for a given user.
CREATE INDEX "transactions_userId_createdAt_idx"
  ON "transactions"("userId", "createdAt" DESC);

-- ── Full-text search ──
-- GIN over a tsvector covers ILIKE-replacing search on title + description.
-- Prisma's schema language cannot express tsvector indexes, so this lives
-- only in raw SQL. auction.service.getAuctions will switch from ILIKE to
-- `to_tsvector` in a follow-up commit; for now the index is in place so
-- the rewrite is one query change away.
CREATE INDEX "auctions_title_description_fts_idx" ON "auctions"
  USING GIN (to_tsvector('english', "title" || ' ' || "description"));
