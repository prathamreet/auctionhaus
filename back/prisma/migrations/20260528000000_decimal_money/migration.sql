-- Phase A1: convert every money field from DOUBLE PRECISION (Float) to
-- NUMERIC(18,2) so storage is exact. Defaults preserved. The USING clause
-- forces an explicit numeric cast for any rows already present.
--
-- All ALTERs are inside one statement-per-line block; if you need to roll
-- back during testing, the inverse is `ALTER COLUMN ... TYPE DOUBLE PRECISION
-- USING ...::double precision`.

-- Wallet
ALTER TABLE "wallets"
  ALTER COLUMN "balance" TYPE NUMERIC(18, 2) USING "balance"::NUMERIC(18, 2),
  ALTER COLUMN "balance" SET DEFAULT 0,
  ALTER COLUMN "heldAmount" TYPE NUMERIC(18, 2) USING "heldAmount"::NUMERIC(18, 2),
  ALTER COLUMN "heldAmount" SET DEFAULT 0;

-- Transaction
ALTER TABLE "transactions"
  ALTER COLUMN "amount" TYPE NUMERIC(18, 2) USING "amount"::NUMERIC(18, 2);

-- Auction
ALTER TABLE "auctions"
  ALTER COLUMN "startingPrice" TYPE NUMERIC(18, 2) USING "startingPrice"::NUMERIC(18, 2),
  ALTER COLUMN "reservePrice"  TYPE NUMERIC(18, 2) USING "reservePrice"::NUMERIC(18, 2),
  ALTER COLUMN "currentPrice"  TYPE NUMERIC(18, 2) USING "currentPrice"::NUMERIC(18, 2),
  ALTER COLUMN "buyNowPrice"   TYPE NUMERIC(18, 2) USING "buyNowPrice"::NUMERIC(18, 2),
  ALTER COLUMN "dutchPriceStep" TYPE NUMERIC(18, 2) USING "dutchPriceStep"::NUMERIC(18, 2),
  ALTER COLUMN "minIncrement"  TYPE NUMERIC(18, 2) USING "minIncrement"::NUMERIC(18, 2),
  ALTER COLUMN "minIncrement"  SET DEFAULT 1;

-- Bid
ALTER TABLE "bids"
  ALTER COLUMN "amount" TYPE NUMERIC(18, 2) USING "amount"::NUMERIC(18, 2);

-- AutoBid
ALTER TABLE "auto_bids"
  ALTER COLUMN "maxAmount"  TYPE NUMERIC(18, 2) USING "maxAmount"::NUMERIC(18, 2),
  ALTER COLUMN "currentBid" TYPE NUMERIC(18, 2) USING "currentBid"::NUMERIC(18, 2),
  ALTER COLUMN "currentBid" SET DEFAULT 0;
