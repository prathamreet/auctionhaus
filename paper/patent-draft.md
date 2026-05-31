# Provisional Patent Application — Draft

> **Form 2 (Indian Patents Act, 1970 — Provisional Specification)**
>
> This is a working draft. Before filing, have a registered Indian patent
> agent review for compliance with section 9(1) of the Act and the
> drafting conventions of the Patent Office. A provisional locks the
> filing date; a complete specification follows within twelve months.

---

## 1. Title of the Invention

**System and Method for Atomic Resolution of Concurrent Proxy Bids with
Durable Per-Increment Logging in Online Auction Platforms**

(Note: the Patent Office prefers titles under fifteen words. The
shorter form **"Atomic Proxy-Bid Resolution with Per-Increment Logging
for Online Auctions"** is recommended for the final filing.)

---

## 2. Field of the Invention

The invention relates to the technical field of online auction platforms,
and more specifically to a database concurrency control mechanism for
resolving multiple concurrent automated ("proxy") bids on a single
auction item while persisting every incremental bid as a discrete
database record, such that the bid history of the auction reflects the
complete sequence of intermediate prices rather than a single
closed-form jump to the equilibrium price.

---

## 3. Background of the Invention

### 3.1 Conventional Proxy Bidding

Online English auctions universally permit a bidder to delegate to the
platform an upper price limit, hereinafter the *maximum amount*, with
the standing instruction that the platform shall counter-bid on the
bidder's behalf by exactly one minimum-increment whenever the bidder
is outbid, up to the said maximum amount. Such delegated bidding is
known as *proxy bidding* or *automatic bidding*.

When two or more bidders have configured proxy bids on the same auction
item, the auction's stable price is reached when only the highest-limit
proxy remains active; this price is the second-highest maximum amount
plus one minimum-increment, or the highest maximum amount if it is
less than the said sum.

### 3.2 Disadvantages of the Prior Art

Two implementation strategies for proxy bid resolution are known in
prior art:

**(a) Closed-Form Single-Jump Resolution.** Upon receipt of a manual
bid, the platform computes the stable price in closed form and writes
a single bid record to the auction history at the computed stable price.
This approach is computationally efficient but suffers the disadvantage
that the auction history does not reflect the granular sequence of
intermediate prices, depriving the platform operator of an audit trail
required for regulatory compliance, dispute resolution, shill-bidding
detection, and bidder behavioural analytics.

**(b) Recursive Per-Increment Resolution.** Upon receipt of a manual
bid, the platform recursively invokes the bid placement procedure for
each successive increment until the stable price is reached. Each
recursive invocation opens its own database transaction. This approach
preserves the granular history but suffers the disadvantages that
(i) nested database transactions are not supported by common
object-relational mappers and produce undefined behaviour or deadlocks
in concurrent execution, (ii) partial commits (in which some but not
all of the per-increment records persist) leave the auction in an
inconsistent state from which automatic recovery is not feasible, and
(iii) the procedure is non-deterministic across re-runs of identical
input because partial-commit failures produce different intermediate
states on each execution.

### 3.3 Problem to be Solved

There exists a need in the art for a proxy bid resolution method that
simultaneously achieves (a) persistence of every incremental bid as a
distinct record in the auction history, (b) atomicity of the resolution
operation such that the auction transitions in a single observable
step, (c) freedom from deadlock against concurrent writers of the
auction state, and (d) idempotency under retry by an asynchronous
worker subsystem.

---

## 4. Summary of the Invention

The present invention provides a system and method by which a plurality
of concurrent proxy bids on an online auction are resolved into a
sequence of incremental bid records inside a single database
transaction, governed by a two-tier hierarchical row-locking discipline
and a bounded iterative procedure, the said procedure being deterministic
and idempotent under retry, and the said records being committed atomically
such that no intermediate state of the resolution is observable to
concurrent readers of the auction state.

In a first aspect, the invention comprises:

- a database holding an auction record, a plurality of wallet records,
  and a plurality of proxy-bid records;
- a worker subsystem receiving a resolution request triggered by a
  preceding manual bid event;
- a serializable transaction governing the resolution, said transaction
  acquiring an exclusive lock on the auction record prior to acquiring
  any wallet lock, and acquiring locks on every participating wallet
  record in an ascending lexicographic order of a user identifier
  field, said acquisition order being globally observed by every
  writer of the said records, such that no wait-for cycle can form
  between transactions;
- an iterative procedure within the said transaction that walks the
  proxy-bid pool in descending order of the maximum amount, breaking
  ties in ascending order of a creation timestamp, and on each
  iteration (i) computes the next incremental price as the current
  auction price plus one minimum-increment, (ii) verifies that the
  challenger's available wallet balance covers the said next
  incremental price, (iii) if and only if the verification succeeds,
  emits a new bid record at the said next incremental price,
  reassigns the auction's current winning bidder to the challenger,
  and updates wallet balances accordingly, and (iv) advances the loop
  state to the said next incremental price;
- a termination condition under which the said loop exits when the
  pool of challengers having maximum amount at least equal to the
  next incremental price is empty;
- a finite upper bound on the loop iteration count derived from the
  highest proxy-bid maximum amount and the minimum increment; and
- a post-commit emission step in which the entire sequence of
  incremental bid records is communicated to subscribed clients in
  a single message.

In a second aspect, the invention provides for the said transaction
to be replayed by the said worker subsystem in the event of worker
failure, said replay being idempotent in that a re-invocation observes
the post-commit auction state and produces, at most, an empty sequence
of additional incremental bid records.

In a third aspect, the invention provides a mechanism whereby the
auction extension policy known in the art as *anti-sniping* is applied
at most once per resolution regardless of the number of incremental
bid records produced, thereby preserving the user-perceived semantics
that the resolution is a singular reaction to a single triggering bid
event.

---

## 5. Detailed Description of the Invention

### 5.1 System Architecture

A computing system embodying the invention comprises:

1. **A relational database server** providing serializable transactions
   and explicit row-level exclusive locks (for example, PostgreSQL with
   the `SELECT ... FOR UPDATE` statement).

2. **An application server** hosting a bid placement procedure
   accessible by network endpoints and emitting events to subscribed
   clients via a publish-subscribe channel.

3. **A worker subsystem** consuming asynchronous job records from a
   queue (for example, Redis Streams or BullMQ), each job record
   carrying an auction identifier and a triggering user identifier.

4. **A client subsystem** rendering an auction history view from
   server-pushed events.

### 5.2 Database Schema (Exemplary)

The database holds at least:

- `auctions(id, sellerId, type, status, currentPrice, minIncrement,
  endTime, ...)`
- `wallets(id, userId, balance, heldAmount)`
- `auto_bids(id, auctionId, bidderId, maxAmount, isActive, createdAt)`
- `bids(id, auctionId, bidderId, amount, status, isAutoBid, createdAt)`

A global *lock-order invariant* is declared and enforced by every
write procedure in the system: the auction record is locked first;
thereafter, wallet records of every participating user are locked in
ascending lexicographic order of `userId`.

### 5.3 The Resolution Procedure

Receipt of a manual bid event, designated the *triggering bid*, with
trigger bidder identifier `T` on auction identifier `A`, enqueues a
job to the worker subsystem with payload `{ A, T }`. The worker
dequeues this job and executes the following procedure within a single
database transaction:

```
PROCEDURE ResolveAutoBids(A, T):

  // Step 1: Lock auction row.
  EXECUTE: SELECT id FROM auctions WHERE id = A FOR UPDATE.
  IF no row returned, COMMIT and RETURN empty.

  // Step 2: Validate state.
  LOAD auction record A with fields { type, status, endTime,
                                       currentPrice, minIncrement }.
  IF status != ACTIVE OR now() > endTime, COMMIT and RETURN empty.
  IF type != ENGLISH, COMMIT and RETURN empty.

  // Step 3: Load proxy-bid pool, excluding the trigger bidder.
  POOL := SELECT * FROM auto_bids
          WHERE auctionId = A AND isActive = TRUE AND bidderId != T
          ORDER BY maxAmount DESC, createdAt ASC.
  IF POOL is empty, COMMIT and RETURN empty.

  // Step 4: Lock every participating wallet in ascending userId order.
  USERS := SORT( {T} UNION {bidderId : ab IN POOL} ).
  FOR EACH u IN USERS:
    EXECUTE: SELECT id FROM wallets WHERE userId = u FOR UPDATE.

  // Step 5: Initialise loop state.
  trigger_bid := the most recent WINNING bid by T on A.
  cur          := A.currentPrice.
  winner       := trigger_bid.
  STEPS        := empty list.
  K_max        := ceil((highest maxAmount in POOL - cur) / minIncrement) + 1.

  // Step 6: Walk the ladder.
  FOR k := 1 TO K_max:
    next := cur + minIncrement.
    // Remaining viable challengers.
    POOL := { ab IN POOL :
              ab.maxAmount >= next AND ab.bidderId != winner.bidderId }.
    IF POOL is empty, BREAK.
    challenger := element of POOL with largest maxAmount.

    // Affordability check inside the locked transaction.
    wallet := load wallet of challenger.bidderId.
    IF wallet.balance - wallet.heldAmount < next:
      MARK challenger.isActive := FALSE.
      REMOVE challenger from POOL.
      CONTINUE (do not advance cur).

    // Outbid previous winner, refund their held amount.
    UPDATE winner.status := OUTBID.
    INCREMENT (winner_wallet.balance) BY winner.amount,
    DECREMENT (winner_wallet.heldAmount) BY winner.amount.

    // Insert new bid row at exactly cur + minIncrement.
    new_bid := INSERT INTO bids (auctionId=A, bidderId=challenger.bidderId,
                                  amount=next, status=WINNING, isAutoBid=TRUE).

    // Hold the challenger's new amount.
    DECREMENT (wallet.balance) BY next,
    INCREMENT (wallet.heldAmount) BY next.

    APPEND new_bid TO STEPS.

    // Advance state.
    cur     := next.
    winner  := new_bid.

  // Step 7: Persist final auction price.
  IF STEPS is non-empty:
    UPDATE auctions SET currentPrice = cur WHERE id = A.

  COMMIT.
  RETURN STEPS.
```

After commit, the worker subsystem emits a single event of type
`bid:ladder` to subscribers of the auction channel, carrying the
entire `STEPS` array. Subscribed clients refresh their bid history
view from the said event.

### 5.4 Idempotency Under Worker Re-Delivery

Should the worker subsystem re-deliver the job (owing to worker crash,
network partition, or stalled-job recovery), the re-delivery executes
the procedure against the post-commit state of the prior delivery. The
auction's current price has advanced past every challenger's maximum
amount (or the loop terminated at the same Vickrey-equivalent stable
price), so the loop in Step 6 produces an empty `STEPS` list. The
re-delivery is therefore a no-operation with respect to durable state.

### 5.5 Anti-Sniping Interaction

In an embodiment, the auction record carries an `antiSnipingMins`
field specifying that the auction's `endTime` shall be extended if a
bid arrives within the said number of minutes prior to `endTime`.
The extension is applied by the manual bid handler upon receipt of
the triggering bid; the procedure described in Section 5.3 does not
apply further extensions notwithstanding the number of incremental
bid records produced. The said singular extension preserves the
user-perceived semantics that the resolution is a singular reaction
to a single triggering bid event.

### 5.6 Determinism

The procedure is deterministic in that, for identical inputs (auction
state, pool, trigger bidder), the same sequence of incremental bid
records is produced on every execution. Determinism is achieved by
(a) the secondary sort on `createdAt ASC` which resolves ties in
`maxAmount` in a fixed order, and (b) the atomicity of the enclosing
transaction which precludes interleaved writes from concurrent
transactions.

---

## 6. Claims

### Independent Claim

**1.** A method, executed by a computing system comprising at least one
processor coupled to a relational database, for resolving a plurality
of concurrent automatic bid delegations associated with an online
auction record stored in the said database, the method comprising the
steps of:

(a) initiating a serializable database transaction;

(b) acquiring an exclusive row-level lock on the said auction record
prior to acquiring any other row-level lock;

(c) reading from the said auction record a current price, a minimum
increment, an end time, and a status field;

(d) terminating the said transaction if the said status field does
not indicate an active auction or if a current system time exceeds
the said end time;

(e) loading from the said database a set of automatic bid delegation
records associated with the said auction record and not associated
with a triggering user identifier, ordered first by a maximum amount
field descending and second by a creation timestamp field ascending;

(f) acquiring an exclusive row-level lock on each wallet record
associated with users participating in the said set and the said
triggering user identifier, the said locks being acquired in an
ascending lexicographic order of a user identifier field;

(g) iteratively executing, for at most a finite bound derived from
the said maximum amount and the said minimum increment, the following
steps:

  (g1) computing a next incremental price as the said current price
  plus the said minimum increment;

  (g2) selecting a challenger record from the said set whose maximum
  amount is at least the said next incremental price and whose user
  identifier differs from a current winning bidder identifier;

  (g3) terminating the iteration if no challenger satisfies the
  selection criterion;

  (g4) verifying that an available balance of the wallet associated
  with the said challenger record is at least the said next
  incremental price, and if not, deactivating the said challenger
  record in the said database and continuing the iteration without
  advancing the said current price;

  (g5) inserting into the said database a new bid record at the said
  next incremental price, the said new bid record being associated
  with the said challenger's user identifier and marked as automatic;

  (g6) updating the said wallet records to release a held amount of
  the prior winning bid and to hold the said next incremental price
  against the said challenger's wallet;

  (g7) assigning the said current price to the said next incremental
  price and the said current winning bidder identifier to the said
  challenger's user identifier;

(h) updating the said auction record with the said current price
upon completion of the iteration;

(i) committing the said transaction atomically; and

(j) after the said committing, emitting a single event message to
subscribed clients carrying the sequence of new bid records produced
in step (g5).

### Dependent Claims

**2.** The method of claim 1, wherein the said serializable database
transaction is implemented by a `SELECT ... FOR UPDATE` statement
executed against a PostgreSQL database operating at the
`READ COMMITTED` isolation level.

**3.** The method of claim 1, wherein every write operation on the
said auction record, the said wallet records, and a settlement
record associated with the said auction obeys the lock acquisition
order recited in steps (b) and (f), such that no two writers can
form a wait-for cycle and the said system is provably free of
deadlock.

**4.** The method of claim 1, further comprising re-delivering the
said method by a worker subsystem in response to a worker failure,
wherein the said re-delivery is idempotent in that it produces at most
an empty sequence of new bid records.

**5.** The method of claim 1, wherein the said triggering user
identifier is associated with a manual bid record inserted into the
said database in a transaction preceding the said serializable
transaction.

**6.** The method of claim 1, wherein an auction-end-time extension
known in the art as anti-sniping is applied at most once in respect
of the said triggering user identifier, notwithstanding the number of
new bid records produced in step (g5).

**7.** The method of claim 1, wherein the said event message is
communicated to the said subscribed clients via a Socket.io channel
named after the said auction record's identifier.

**8.** A system comprising at least one processor and at least one
memory storing instructions which, when executed by the said
processor, cause the said system to perform the method of claim 1.

**9.** A non-transitory computer-readable medium storing instructions
which, when executed by at least one processor, cause the said
processor to perform the method of claim 1.

---

## 7. Abstract of the Disclosure

A method and system for resolving a plurality of concurrent automatic
proxy bid delegations on an online auction such that every
incremental bid is persisted as a discrete record in the auction
history, the resolution being performed within a single serializable
database transaction governed by a two-tier hierarchical row-locking
discipline. The method acquires an exclusive lock on the auction
record, thereafter acquires exclusive locks on participating wallet
records in a globally ordered user-identifier sequence, and then walks
the proxy-bid pool one minimum-increment at a time, inserting a new
bid record at each step. The resolution is bounded, deterministic,
deadlock-free against any writer obeying the said lock order, and
idempotent under retry by an asynchronous worker subsystem.

---

## 8. Filing Notes (for Patent Agent — not part of the spec)

- **Form 1** (Application for Grant) accompanies this Form 2.
- **Form 5** (Declaration as to Inventorship) is filed with the
  complete specification within twelve months.
- **Statutory fees** (Indian Patent Office, July 2026 schedule, for a
  natural-person applicant):
  - Form 1 + Form 2 + Form 9 (early publication, optional): approx.
    ₹1,600 + ₹0 + ₹0 (Form 9 is free; Form 1 covers the basic filing).
  - The agent's professional fee typically falls in the range
    ₹6,000 – ₹15,000 depending on the agent.
- The **filing date** of this provisional locks priority for the
  twelve-month window in which the complete specification must be
  filed.
- The **claims** in Section 6 are illustrative; the agent will
  typically rewrite them in Patent Office style. Independent claim 1
  is intentionally broad. Dependent claims 2–7 narrow it to specific
  embodiments to provide fallback positions during prosecution.
- **Inventorship**: this draft assumes a single inventor. If a
  collaborator contributed materially to the conception (not just the
  implementation), they must be joined as co-inventor; otherwise the
  patent is invalid under section 28 of the Act.
- **Prior art search**: before filing, conduct an InPASS search
  (Indian Patent Advanced Search System) and a PATENTSCOPE search
  (WIPO) for the keywords "proxy bid resolution", "atomic ladder",
  "auction concurrency", "incremental bid persistence". Document
  findings in a separate prior-art annex; the agent uses it to scope
  the claims.
- **Non-obviousness**: the chief argument is that closed-form and
  recursive prior implementations both exist in the wild and both
  fail to achieve all five properties (P1–P5) simultaneously; the
  global-lock-order invariant combined with the bounded per-step
  loop is the non-obvious step. Cite the empirical evaluation in
  `paper/auto-bid-ladder.tex` as evidence of the technical advance.
