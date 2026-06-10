# Chapter 7 — Concurrency Control and Money

## Why This Chapter Exists

If you ask most developers what the hardest part of building an auction platform is, they will probably say "the real-time updates." They would be wrong. The hardest part is making sure that when two people try to do things at the same time, the numbers stay correct and money never appears or disappears.

This chapter explains:
1. Why floating-point arithmetic is wrong for money
2. What a race condition is and the five that existed in AuctionHaus
3. How pessimistic row locking fixes them
4. The global lock-ordering policy that prevents deadlocks
5. The idempotent settlement pattern

---

## Part 1: Why Floating-Point Is Wrong for Money

### The IEEE-754 Problem

Computers store decimal numbers as binary fractions. The number `0.1` cannot be represented exactly in binary — it is a repeating fraction, like `1/3` in decimal. The closest 64-bit floating-point approximation is `0.1000000000000000055511151231257827021181583404541015625`.

This creates problems for arithmetic:

```javascript
0.1 + 0.2           // = 0.30000000000000004
1000.10 - 500.10    // = 499.99999999999994
```

In a financial system, these errors accumulate. After 50 bid hold-and-release cycles, a user's wallet balance might show ₹0.07 when it should be ₹0.00. The user cannot withdraw (₹0.07 is below the minimum withdrawal), cannot bid (insufficient funds error), and support has no way to explain the phantom fraction.

Real financial systems — banks, payment processors, stock exchanges — never use floating-point for money. They use either integers (storing everything in the smallest denomination, like cents) or exact decimal types.

### The Prisma Decimal Solution

The fix in AuctionHaus was the Phase A1 migration: changing every money field from `Float` to `Decimal @db.Decimal(18, 2)` in the Prisma schema.

`NUMERIC(18, 2)` in PostgreSQL stores values as scaled integers internally — no binary fraction representation, no rounding error. `18` digits before the decimal point (over 900 quadrillion units), `2` digits after (cents/paise precision).

In TypeScript, Prisma maps `Decimal` columns to the `Prisma.Decimal` class, which implements exact decimal arithmetic:

```typescript
import { Decimal } from '@prisma/client/runtime/library';

const price = new Decimal('999.99');
const bid   = new Decimal('500.10');
const remainder = price.sub(bid);  // Decimal("499.89") -- exact
```

The `D()` helper in `back/src/lib/decimal.ts` is a shorthand constructor:
```typescript
export const D = (v: number | string | Decimal) => new Decimal(v);
export const toNum = (d: Decimal) => d.toNumber();
```

Every arithmetic operation in the service layer uses Decimal methods: `.add()`, `.sub()`, `.mul()`, `.div()`, `.lt()`, `.gt()`, `.eq()`, `.lte()`, `.gte()`. Only at the API boundary — when building the JSON response — is a Decimal converted to a number via `toNum()`. The JSON representation has 2 decimal places, which is fine for the frontend display.

---

## Part 2: Race Conditions

### What Is a Race Condition?

A race condition occurs when the correctness of a computation depends on the relative timing of two concurrent operations. Because timing is non-deterministic, the outcome is unpredictable.

In a database context, a race condition typically looks like this:

```
Transaction A:  READ wallet_balance    → 5000
Transaction B:  READ wallet_balance    → 5000  (reads before A updates)
Transaction A:  WRITE balance = 5000 - 3000 = 2000
Transaction B:  WRITE balance = 5000 - 4000 = 1000  (WRONG: should be 2000 - 4000 = insufficient)
```

Both transactions read the same initial value. Both pass their validation check. Both update — but transaction B's update is based on a stale read. The final balance is 1000, not 2000 - 4000 (which would have been rejected as insufficient).

### The Five Race Conditions in the Original Code

**Race 1: Concurrent bid placement**

Two users place bids at the same time. Both call `prisma.auction.findUnique()` — which does NOT lock the row. Both read `currentPrice = 1000`. Both validate "my amount (1500) > currentPrice + minIncrement (1100): OK." Both try to become the winning bid. Two WINNING bids exist simultaneously. The auction shows two winners. Money is held twice.

**Fix:** `SELECT * FROM auctions WHERE id = ? FOR UPDATE` inside the transaction. The second transaction waits until the first commits. When it reads, it sees the updated price from the first.

**Race 2: Concurrent withdrawal**

Two browser tabs simultaneously hit "Withdraw ₹5,000" on the same wallet. Both read `balance = 8,000`. Both pass validation (8,000 >= 5,000). Both update: `balance = 3,000`. The final balance is 3,000 — but ₹10,000 was withdrawn from an ₹8,000 balance.

**Fix:** `SELECT * FROM wallets WHERE userId = ? FOR UPDATE` in the withdrawal transaction. One tab waits; when it resumes, it sees the correct balance from the first withdrawal.

**Race 3: endAuction non-idempotent under retry**

BullMQ has at-least-once delivery. If a worker crashes while processing `end-auction`, BullMQ retries the job. If the status check `auction.status === ENDED` is not inside the same transaction as the status update, two concurrent executions can both pass the check before either updates the status.

**Fix:** Move the status check inside the locked transaction:
```
tx.auction.findFirst({ where: { id: auctionId, status: 'ACTIVE' }, ...FOR UPDATE })
if (!auction) return  // already ended
// ... proceed with settlement
```

Now the second execution reads `status = ENDED` inside the lock and returns immediately.

**Race 4: Auto-bid nested transactions**

The original code called `processAutoBids()` from inside a `placeBid` transaction. `processAutoBids` called `placeBid` again. `placeBid` opened another `prisma.$transaction`. Prisma 5 does not support nested interactive transactions — the inner transaction silently runs in the context of the outer transaction (transaction flattening), losing isolation.

Under load with multiple concurrent auto-bidders, this could produce:
- Phantom reads (the inner transaction reads uncommitted changes from the outer)
- Deadlocks (if two outer transactions both try to nest inner transactions that need each other's locks)

**Fix:** Remove the nesting entirely. After the manual bid commits, enqueue a `process-ladder` BullMQ job. The ladder runs in a fresh, separate transaction with full isolation.

**Race 5: Settlement double-pay**

`buyNow` and `confirmWinnerPayment` (the backstop payment confirmation) could both run for the same auction if a network hiccup caused a double submit or a BullMQ retry.

**Fix:** The `Settlement` table with `auctionId @unique`. The first call to `settleWithinTx` inserts a row. The second call finds the row and returns `{ alreadySettled: true }` before touching any money. The unique constraint enforced by Postgres prevents any race.

---

## Part 3: SELECT FOR UPDATE — How It Works

`SELECT ... FOR UPDATE` is a SQL lock hint. When a transaction executes this query, it acquires an exclusive row lock on every row returned. Other transactions that try to `SELECT FOR UPDATE` or `UPDATE` the same rows must wait until the lock holder commits or rolls back.

In Prisma 5, you express this via `$queryRaw`:

```typescript
const [auction] = await tx.$queryRaw<AuctionRow[]>`
  SELECT * FROM auctions WHERE id = ${auctionId} FOR UPDATE
`;
```

This is the `FOR UPDATE` lock on the auction row. It guarantees that from the moment of this query until the transaction commits, no other transaction can read the auction with a lock or modify it.

### The Wait Graph

Consider four concurrent bid transactions:

```
T1 locks auction A (bid attempt)
T2 waits for T1 to release (same auction A)
T3 locks auction B (different auction, no conflict)
T4 waits for T3 to release (same auction B)
```

T1 and T3 run in parallel (different auctions). T2 waits for T1. T4 waits for T3. No deadlock here because the wait graph is a simple chain: T2 → T1, T4 → T3.

Deadlocks happen when you have a cycle: T1 waits for T2, T2 waits for T1. That cannot happen if every transaction acquires locks in the same order.

---

## Part 4: The Global Lock-Ordering Policy

The deadlock prevention invariant in AuctionHaus:

> **Always lock the auction row first, then wallet rows in ascending userId order.**

This is applied consistently across every write path:

| Function | Lock order |
|----------|-----------|
| `placeBid` | auction → wallets[userId ASC] |
| `withdraw` | wallet[userId] |
| `buyNow` | auction → wallets[userId ASC] |
| `endAuction` | auction → wallets[userId ASC] |
| `settleWithinTx` | (auction already locked by caller) → wallets[userId ASC] |
| `processAutoBidLadder` | auction → wallets[userId ASC] |

### Why This Prevents Deadlocks

Suppose T1 is settling (buyer=100, seller=200) and T2 is also settling (buyer=200, seller=100). Without a lock order:

- T1 locks wallet 100, then tries to lock wallet 200
- T2 locks wallet 200, then tries to lock wallet 100
- T1 waits for T2. T2 waits for T1. Deadlock.

With userId-ascending order:

- T1 locks wallet 100 (lower ID first), then wallet 200
- T2 also tries wallet 100 first, waits for T1
- T1 completes and releases both locks
- T2 acquires wallet 100, then wallet 200

No cycle. No deadlock. This is the textbook "resource ordering" deadlock prevention technique, applied to wallet rows.

---

## Part 5: The EscrowService and Idempotent Settlement

The EscrowService (`modules/escrow/escrow.service.ts`) provides one function: `settleWithinTx`. This is the single code path through which money moves from buyer to seller.

Before it existed, payout logic was duplicated in three places: `buyNow`, `confirmWinnerPayment`, and `endAuction`. Duplicate code means duplicate bugs — if you fix a financial bug in one place, you might miss the other two.

The Settlement model is the idempotency guard. Its schema:

```sql
CREATE TABLE settlements (
  id         UUID PRIMARY KEY,
  auctionId  VARCHAR UNIQUE,  -- uniqueness constraint
  sellerId   VARCHAR,
  partyId    VARCHAR,
  amount     NUMERIC(18,2),
  kind       settlement_kind,
  createdAt  TIMESTAMP
);
```

The `auctionId UNIQUE` constraint means at most one settlement per auction, enforced at the database level. No application-level logic can accidentally bypass this.

### Flow with Idempotency

```
buyNow called:
  → open tx
  → lock auction FOR UPDATE
  → call settleWithinTx(tx, { kind: DIRECT_SALE, ... })
      → SELECT * FROM settlements WHERE auctionId=? -- none found
      → INSERT INTO settlements (auctionId, ...) -- succeeds
      → move money
  → commit

User double-clicks buyNow (race):
  → open tx
  → lock auction FOR UPDATE  -- waits for above tx
  → call settleWithinTx(tx, ...)
      → SELECT * FROM settlements WHERE auctionId=? -- found!
      → return { alreadySettled: true }
      → NO money movement
  → commit (no-op)
```

The second click does nothing. The user's wallet is not double-charged.

---

## Part 6: Correctness Checklist

To verify the concurrency model is correct, you would run this SQL after a k6 concurrent bid test:

```sql
-- No two WINNING bids on the same auction simultaneously
SELECT auctionId, COUNT(*) 
FROM bids 
WHERE status = 'WINNING' 
GROUP BY auctionId 
HAVING COUNT(*) > 1;
-- Should return zero rows.

-- No auction settled twice
SELECT auctionId, COUNT(*) 
FROM settlements 
GROUP BY auctionId 
HAVING COUNT(*) > 1;
-- Should return zero rows.

-- Wallet balance consistency
SELECT userId, 
       wallet.balance + wallet.heldAmount AS wallet_total,
       SUM(t.amount) AS ledger_total
FROM wallets
JOIN transactions t ON t.walletId = wallet.id
GROUP BY userId, wallet.balance, wallet.heldAmount
WHERE wallet_total != ledger_total;
-- Should return zero rows (all ledger entries reconcile).
```

---

## Next Chapter

Chapter 8 explains the real-time layer: how Socket.io connects to Express, how rooms and events work, what happens on reconnection, and how the presence counter avoids emitting a flood of updates during rapid connect/disconnect cycles.
