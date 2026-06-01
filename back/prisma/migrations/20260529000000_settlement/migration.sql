-- Phase A5: settlements table -- the one-row-per-auction idempotency guard for
-- money settlement, shared by buyNow (DIRECT_SALE) and confirmWinnerPayment
-- (WON_AUCTION). The UNIQUE index on "auctionId" is what makes a second
-- (concurrent or retried) settle attempt no-op instead of moving money twice.
--
-- Hand-written to match exactly what Prisma would generate from the Settlement
-- model + SettlementKind enum in schema.prisma, so the next `migrate dev` sees
-- no drift. Folder prefix 20260529000000_ keeps it ordered after the
-- 20260528000001_perf_indexes migration.

-- CreateEnum
CREATE TYPE "SettlementKind" AS ENUM ('DIRECT_SALE', 'WON_AUCTION');

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "kind" "SettlementKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settlements_auctionId_key" ON "settlements"("auctionId");
