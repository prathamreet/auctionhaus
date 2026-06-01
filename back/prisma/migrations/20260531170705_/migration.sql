-- DropForeignKey
ALTER TABLE "bid_commitments" DROP CONSTRAINT "bid_commitments_auctionId_fkey";

-- DropForeignKey
ALTER TABLE "bid_commitments" DROP CONSTRAINT "bid_commitments_bidderId_fkey";

-- DropForeignKey
ALTER TABLE "fraud_flags" DROP CONSTRAINT "fraud_flags_auctionId_fkey";

-- DropForeignKey
ALTER TABLE "fraud_flags" DROP CONSTRAINT "fraud_flags_bidderId_fkey";

-- DropIndex
DROP INDEX "fraud_flags_dismissed_idx";

-- DropIndex
DROP INDEX "transactions_userId_createdAt_idx";

-- CreateIndex
CREATE INDEX "fraud_flags_dismissed_createdAt_idx" ON "fraud_flags"("dismissed", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_userId_createdAt_idx" ON "transactions"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_commitments" ADD CONSTRAINT "bid_commitments_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_commitments" ADD CONSTRAINT "bid_commitments_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
