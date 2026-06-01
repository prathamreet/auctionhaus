-- Phase C2/C3: fraud flag persistence table
-- One row per fraud:flag event emitted by the real-time detector.

CREATE TABLE "fraud_flags" (
    "id"         TEXT          NOT NULL,
    "bidderId"   TEXT          NOT NULL,
    "auctionId"  TEXT          NOT NULL,
    "bidId"      TEXT          NOT NULL,
    "score"      DOUBLE PRECISION NOT NULL,
    "features"   JSONB         NOT NULL,
    "reason"     TEXT          NOT NULL,
    "dismissed"  BOOLEAN       NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_flags_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fraud_flags_bidderId_idx"    ON "fraud_flags"("bidderId");
CREATE INDEX "fraud_flags_auctionId_idx"   ON "fraud_flags"("auctionId");
CREATE INDEX "fraud_flags_dismissed_idx"   ON "fraud_flags"("dismissed", "createdAt" DESC);

ALTER TABLE "fraud_flags"
    ADD CONSTRAINT "fraud_flags_bidderId_fkey"
    FOREIGN KEY ("bidderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fraud_flags"
    ADD CONSTRAINT "fraud_flags_auctionId_fkey"
    FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase C6: sealed-bid commitment table (SHA-256 commit/reveal scheme)
-- Client commits H = SHA-256(hex(amount) || nonce) before auction ends;
-- reveals (amount, nonce) after close so server can verify without knowing
-- the amount during live bidding.

CREATE TABLE "bid_commitments" (
    "id"             TEXT          NOT NULL,
    "auctionId"      TEXT          NOT NULL,
    "bidderId"       TEXT          NOT NULL,
    "commitHash"     TEXT          NOT NULL,
    "nonce"          TEXT,
    "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt"     TIMESTAMP(3),
    "revealedAmount" NUMERIC(18,2),
    "revealedNonce"  TEXT,
    "isValid"        BOOLEAN,

    CONSTRAINT "bid_commitments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bid_commitments_auctionId_bidderId_key"
    ON "bid_commitments"("auctionId", "bidderId");

ALTER TABLE "bid_commitments"
    ADD CONSTRAINT "bid_commitments_auctionId_fkey"
    FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bid_commitments"
    ADD CONSTRAINT "bid_commitments_bidderId_fkey"
    FOREIGN KEY ("bidderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
