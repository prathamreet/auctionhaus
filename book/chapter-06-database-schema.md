# Chapter 4 — The Database Schema

## Overview

The database is the heart of the application. Every feature — bids, wallets, fraud flags, cryptographic commitments — exists as a row in a table. Understanding the schema means understanding the domain.

AuctionHaus uses PostgreSQL 15 with Prisma 5 as the ORM. The schema file lives at `back/prisma/schema.prisma`. There are:

- **9 enums** (for categorical fields with fixed values)
- **11 models** (tables)
- **Multiple migrations** (SQL files that evolve the schema over time)

Let us walk through everything.

---

## The Enums

Enums are fields that can only hold one of a fixed set of values. Using them instead of plain strings prevents typos and makes the code self-documenting.

### Role

```prisma
enum Role {
  USER
  ADMIN
}
```

Every user is either a regular USER or an ADMIN. Admins can access the admin panel, suspend users, and moderate auctions.

### AuctionType

```prisma
enum AuctionType {
  ENGLISH
  DUTCH
  SEALED_BID
}
```

The three auction formats. One `Auction` row covers all three — different fields are nullable or not based on the type.

### AuctionStatus

```prisma
enum AuctionStatus {
  PENDING   -- not started yet
  ACTIVE    -- accepting bids
  ENDED     -- ended naturally or manually
  CANCELLED -- cancelled by seller or admin
}
```

The lifecycle of an auction. A BullMQ worker transitions PENDING → ACTIVE and ACTIVE → ENDED automatically.

### BidStatus

```prisma
enum BidStatus {
  ACTIVE   -- this bid is the current high bid
  OUTBID   -- a higher bid exists
  WINNING  -- at the moment of auction end, this bid is leading
  WON      -- auction ended, this bid won
  LOST     -- auction ended, this bid did not win
}
```

Notice the difference between OUTBID and LOSING. OUTBID happens during the auction. WON/LOST are set when the auction ends.

### TransactionType

```prisma
enum TransactionType {
  DEPOSIT
  WITHDRAWAL
  BID_HOLD
  BID_RELEASE
  PAYMENT
  REFUND
}
```

Every money movement is a Transaction row. DEPOSIT when you add money. BID_HOLD when you place a bid (money moves from balance to heldAmount). BID_RELEASE when you are outbid or refunded. PAYMENT when you win and the money transfers to the seller. REFUND for cancelled auctions.

This creates a **complete ledger** — an audit trail of every money movement. If you sum all Transaction rows for a wallet, you should get the current balance. This is how real financial systems work.

### SettlementKind

```prisma
enum SettlementKind {
  DIRECT_SALE    -- buyNow: buyer balance → seller balance
  WON_AUCTION    -- winner confirms: held amount → seller balance
}
```

Added in Phase A5. The Settlement table (explained below) uses this to record how money moved when an auction settled.

---

## The Models

### User

```prisma
model User {
  id          String   @id @default(uuid())
  email       String   @unique
  password    String?  -- null if OAuth
  name        String
  avatar      String?
  role        Role     @default(USER)
  rating      Float    @default(0)
  ratingCount Int      @default(0)
  isSuspended Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  ...
}
```

Standard user model. The `password` field is nullable because OAuth users have no password (for future OAuth support). `rating` and `ratingCount` are denormalised — the average rating is stored directly on the user rather than computing it from Rating rows on every profile load. This is a performance tradeoff.

`isSuspended` is the admin's ability to block a user. When `true`, the auth middleware rejects their token.

The user has relations to: wallet, auctions they created, auctions they won, bids, auto-bids, notifications, watchlist items, transactions, ratings sent, ratings received, fraud flags, bid commitments.

### Wallet

```prisma
model Wallet {
  id         String   @id @default(uuid())
  userId     String   @unique
  balance    Decimal  @default(0) @db.Decimal(18, 2)
  heldAmount Decimal  @default(0) @db.Decimal(18, 2)
  ...
}
```

One wallet per user (`userId @unique`). The money fields are `Decimal @db.Decimal(18, 2)` — PostgreSQL `NUMERIC(18,2)`, exact decimal arithmetic.

The `balance` + `heldAmount` split is the escrow model. `balance` is spendable; `heldAmount` is locked. When you place a bid:
- `balance -= amount`
- `heldAmount += amount`

When you are outbid:
- `heldAmount -= amount`
- `balance += amount`

When you win and pay:
- `heldAmount -= amount` (seller gets paid from held)

The wallet never has a negative balance by design — every write path checks that `balance >= amount` before proceeding, inside a locked transaction.

### Transaction

```prisma
model Transaction {
  id          String            @id @default(uuid())
  walletId    String
  userId      String
  type        TransactionType
  amount      Decimal           @db.Decimal(18, 2)
  status      TransactionStatus @default(COMPLETED)
  description String?
  referenceId String?  -- auctionId or bidId
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
}
```

Every money movement creates a Transaction row. The `referenceId` links the transaction to the auction or bid that caused it. The `amount` can be negative for debit operations (WITHDRAWAL, PAYMENT debits the buyer's held amount).

The `@@index([userId, createdAt])` means the wallet history page — which loads a user's recent transactions — does not scan the whole table.

### Auction

```prisma
model Auction {
  id          String        @id @default(uuid())
  sellerId    String
  title       String
  description String
  imageUrl    String?
  type        AuctionType   @default(ENGLISH)
  status      AuctionStatus @default(PENDING)

  startingPrice Decimal  @db.Decimal(18, 2)
  reservePrice  Decimal? @db.Decimal(18, 2)
  currentPrice  Decimal  @db.Decimal(18, 2)
  buyNowPrice   Decimal? @db.Decimal(18, 2)

  dutchPriceStep Decimal? @db.Decimal(18, 2)
  dutchInterval  Int?

  minIncrement    Decimal @default(1) @db.Decimal(18, 2)
  antiSnipingMins Int     @default(5)

  startTime     DateTime
  endTime       DateTime
  actualEndTime DateTime?

  winnerId    String?
  winnerBidId String?

  @@index([status])
  @@index([endTime])
  @@index([type, status])
}
```

The auction model has the most fields because it needs to cover all three formats. Some fields are relevant only to specific types:

- `dutchPriceStep` and `dutchInterval` — Dutch only
- `buyNowPrice` — English only
- `reservePrice` — optional for any type
- `actualEndTime` — set when anti-sniping extends the end time

The `currentPrice` field tracks the live price. For English auctions, it starts at `startingPrice` and rises with each bid. For Dutch auctions, it starts at `startingPrice` and falls with each BullMQ job. For sealed-bid auctions, `currentPrice` is not updated as bids arrive (to prevent leaking information about how many people bid and at what amounts).

**Indexes:** Three B-tree indexes cover the most common queries:
- `[status]` — "show me all ACTIVE auctions"
- `[endTime]` — "which auctions end soon?"
- `[type, status]` — "show me all ACTIVE ENGLISH auctions"

There is also a GIN full-text search index on `to_tsvector('english', title || ' ' || description)` that lives only in the migration SQL (Prisma cannot express tsvector indexes), used by the auction catalogue search.

### Bid

```prisma
model Bid {
  id        String    @id @default(uuid())
  auctionId String
  bidderId  String
  amount    Decimal   @db.Decimal(18, 2)
  status    BidStatus @default(ACTIVE)
  isAutoBid Boolean   @default(false)
  createdAt DateTime  @default(now())
  refundedAt DateTime?

  @@index([auctionId, status])
  @@index([bidderId])
  @@index([auctionId, createdAt(sort: Desc)])
}
```

Every bid is a row. Auto-bid ladder steps each produce their own row (`isAutoBid: true`). This is the "per-increment logging" UX contract from Chapter 9.

The `refundedAt` field was added in Phase E7 for idempotent sealed-bid refunds. When the auction ends, losers' bid holds are refunded. If the worker crashes midway and restarts, the `WHERE refundedAt IS NULL` filter ensures it only refunds bids that were not already refunded.

Three indexes:
- `[auctionId, status]` — "who is winning this auction right now?" (ACTIVE/WINNING status)
- `[bidderId]` — "what has this user bid on?"
- `[auctionId, createdAt DESC]` — "show me this auction's bid history, newest first" (the bid history page)

### AutoBid

```prisma
model AutoBid {
  id         String   @id @default(uuid())
  auctionId  String
  bidderId   String
  maxAmount  Decimal  @db.Decimal(18, 2)
  currentBid Decimal  @default(0) @db.Decimal(18, 2)
  isActive   Boolean  @default(true)

  @@unique([auctionId, bidderId])
  @@index([auctionId, isActive, maxAmount(sort: Desc)])
}
```

One auto-bid per (auctionId, bidderId) pair. The `maxAmount` is the user's ceiling. The `currentBid` tracks where the auto-bid currently stands (useful for the AutoBidHealth UI component).

`isActive` flips to `false` when the auto-bid's max is exhausted or the user cancels it.

The composite index `[auctionId, isActive, maxAmount DESC]` is optimised for the hot path: every manual bid triggers a lookup of all active auto-bids for that auction, sorted by max amount descending. This query hits the index directly, no sort needed.

### WatchlistItem

```prisma
model WatchlistItem {
  id        String   @id @default(uuid())
  userId    String
  auctionId String
  createdAt DateTime @default(now())

  @@unique([userId, auctionId])
}
```

Simple join table. The `@@unique([userId, auctionId])` prevents duplicate watchlist entries.

### Notification

```prisma
model Notification {
  id        String           @id @default(uuid())
  userId    String
  type      NotificationType
  title     String
  message   String
  isRead    Boolean          @default(false)
  data      Json?
  createdAt DateTime         @default(now())

  @@index([userId, isRead])
}
```

The `data` field is a JSON blob for extra context (like the auctionId, so the notification can link to the auction). The `@@index([userId, isRead])` covers "show me this user's unread notifications" efficiently.

### Rating

```prisma
model Rating {
  id        String   @id @default(uuid())
  raterId   String
  rateeId   String
  auctionId String
  score     Int
  comment   String?
  createdAt DateTime @default(now())

  @@unique([raterId, rateeId, auctionId])
}
```

One rating per (rater, ratee, auction) combination. The unique constraint prevents rating the same person twice for the same auction.

### FraudFlag

```prisma
model FraudFlag {
  id        String   @id @default(uuid())
  bidderId  String
  auctionId String
  bidId     String
  score     Float    -- ML output (0-1); Float is OK, not financial
  features  Json     -- the 5 feature values
  reason    String   -- human-readable explanation
  dismissed Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([bidderId])
  @@index([auctionId])
  @@index([dismissed, createdAt])
}
```

Added in Phase C2. One row per flagged bid. The `features` JSON stores the five fraud detection features at the time of flagging (for the admin dashboard). `dismissed` lets an admin mark a flag as a false positive. The `score` field uses `Float` — not `Decimal` — because it is a machine learning probability, not a financial value. Approximate representation is fine here.

### BidCommitment

```prisma
model BidCommitment {
  id             String    @id @default(uuid())
  auctionId      String
  bidderId       String
  commitHash     String    -- SHA-256(amountHex + ":" + nonce)
  nonce          String?
  createdAt      DateTime  @default(now())
  revealedAt     DateTime?
  revealedAmount Decimal?  @db.Decimal(18, 2)
  revealedNonce  String?
  isValid        Boolean?

  @@unique([auctionId, bidderId])
}
```

Added in Phase C6. The two-phase commit-reveal protocol for sealed-bid auctions. During the commit phase, `commitHash` is set. During the reveal phase (after auction ends), `revealedAmount`, `revealedNonce`, and `isValid` are set. The `isValid` flag records whether the reveal matched the commit hash.

### Settlement

```prisma
model Settlement {
  id        String         @id @default(uuid())
  auctionId String         @unique  -- one settlement per auction
  sellerId  String
  partyId   String         -- buyer (DIRECT_SALE) or winner (WON_AUCTION)
  amount    Decimal        @db.Decimal(18, 2)
  kind      SettlementKind
  createdAt DateTime       @default(now())
}
```

Added in Phase A5. The `auctionId @unique` constraint is the idempotency guard. If `buyNow` and `confirmWinnerPayment` race to settle the same auction, the second one gets a unique constraint violation and no-ops instead of moving money twice. This is the simplest possible distributed lock for a "settle exactly once" requirement.

---

## The Migrations

Migrations are SQL files that represent a sequence of schema changes. Each migration is applied once, in order, and the database tracks which ones have been applied.

Key migrations:

| Migration | What it does |
|-----------|-------------|
| `20260528000000_decimal_money` | ALTER COLUMN every money field from FLOAT to NUMERIC(18,2) |
| `20260528000001_perf_indexes` | CREATE INDEX on Auction(status), Auction(endTime), Auction(type,status), Bid(auctionId,status), Bid(bidderId), Notification(userId,isRead), Transaction(userId,createdAt) + GIN tsvector index |
| `20260529000000_settlement` | CREATE TABLE settlements + unique index |
| `20260530000000_fraud_commitments` | CREATE TABLE fraud_flags + CREATE TABLE bid_commitments |
| `20260531000000_phase_e_indexes_refunded_at` | ADD COLUMN bids.refundedAt + CREATE INDEX bids(auctionId,createdAt DESC) + CREATE INDEX auto_bids(auctionId,isActive,maxAmount DESC) |

---

## Why Exact Decimal Matters: A Concrete Example

This is worth spending a moment on because it is the most important database decision in the project.

Suppose a user's wallet balance is ₹999.99. They place a bid of ₹500.10. In floating-point arithmetic:

```javascript
999.99 - 500.10  // = 499.88999999999999  (not 499.89)
```

This rounding error accumulates. After 100 bid holds and releases, the balance might show ₹0.07 when it should be ₹0.00. The user cannot withdraw their remaining balance because ₹0.07 is not a valid withdrawal amount.

With `NUMERIC(18,2)` and Prisma Decimal:

```typescript
D(999.99).sub(D(500.10))  // = Decimal("499.89") exactly
```

No rounding error. Ever. This is not academic — it is the difference between a system you can trust and one that hemorrhages phantom fractions over time.

---

## The God-Node Helper: `decimal.ts`

Since Prisma returns `Decimal` objects for all money fields, and the API needs to return plain numbers (because JSON does not have a Decimal type), every service has the same pattern:

```typescript
import { D, toNum, serializeMoney } from '../../lib/decimal';

// Use Decimal arithmetic in the service layer
const newBalance = D(wallet.balance).sub(D(amount));

// Serialize to number at the API boundary
return {
  balance: toNum(wallet.balance),
  amount: toNum(bid.amount),
};
```

The `serializeMoney()` helper recursively walks an object and converts all Decimal fields to numbers. It is the most widely-called function in the backend — the graph analysis shows it has 30 edges (30 files that import it).

---

## Next Chapter

Chapter 5 takes all these tables and shows how they fit together at a high level — the system architecture, the request lifecycle, and how all the components talk to each other.
