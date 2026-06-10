# Chapter 1 — The Origin Story

## The Beginning: "Just a CRUD App"

Every project starts somewhere. AuctionHaus started with a college assignment: "Build an online marketplace for your major project." The team built an auction platform. It had users, items, bids, a wallet, and an admin panel. It was functional. It looked decent. It was, in every measurable sense, complete.

Then the teachers reviewed it.

"This is just a CRUD app. There's nothing research-worthy here. Any student can do this in a weekend."

Those words stung because they were technically correct.

CRUD stands for Create, Read, Update, Delete — the four basic operations any database-backed web app does. The platform let you create auctions, read bids, update prices, delete watchlist items. Yes, it was CRUD. The teachers weren't wrong. But they also weren't seeing what was possible.

This book is the story of what happened next: how a plain auction platform was transformed into a system with novel concurrency mechanisms, a real-time fraud detection engine backed by a published research paper, cryptographic sealed-bid commitments, and a Redis Stream bid sequencer that outperforms traditional database locking by 28.5x under load.

But to understand where we ended up, you first have to understand where we started — and exactly what was wrong.

---

## What the Codebase Looked Like at the Start

When we did the first honest audit of the code in May 2026, here is what we found:

### The Good Parts

The project was not garbage. Several things were genuinely well-built:

- **Hydration-safe auth store.** The Zustand store for authentication had an `isHydrated` flag that prevented the classic Next.js flash where the server renders a logged-out state and then the client corrects it. This is a subtle bug most student projects get wrong.
- **Edge middleware route protection.** Next.js middleware at the edge layer read a cookie to decide whether to redirect before the page even loaded. Fast and correct.
- **Centralized error handling.** A `parseApiError` helper plus Axios 401 interceptor meant auth failures were handled once, not in every page component.
- **TanStack Query + socket event invalidation.** The pattern of calling `refetchQueries` when a socket event arrived was clean. Real-time updates worked.
- **Zod validation.** The controllers used Zod schemas to validate request bodies. This is professional-level backend practice.
- **Middleware order.** `helmet → cors → morgan → json → rateLimit → routes → errorHandler` is exactly correct. Helmet sets security headers, CORS is configured before routes, the error handler is last.

### The Problems

But underneath the good, there were serious problems in five areas:

**1. Money was stored as floating point.**

Every price field — wallet balance, bid amount, auction starting price, escrow holds — was a JavaScript `number`, stored in Postgres as `Float`. This is a well-known error. IEEE-754 floating point cannot exactly represent most decimal fractions. The classic example: `0.1 + 0.2` in JavaScript is `0.30000000000000004`, not `0.3`. In a system where people are paying real money (even fake demo money), this matters. Rounding errors accumulate. The Prisma schema had:

```prisma
balance    Float
heldAmount Float
amount     Float
```

This needed to become:

```prisma
balance    Decimal @db.Decimal(18, 2)
heldAmount Decimal @db.Decimal(18, 2)
amount     Decimal @db.Decimal(18, 2)
```

**2. Race conditions everywhere.**

A race condition is when two operations happen at the same time and each one assumes the other isn't happening. Consider this scenario: two users try to place bids on the same auction at exactly the same time. The bid service reads the current price, checks that the new bid is high enough, then updates. If both read the current price before either updates it, both might pass the validation check even though only one bid should win. In database terms, this is a phantom read under `READ COMMITTED` isolation — the default in Postgres.

The fix is a `SELECT ... FOR UPDATE` lock: the first transaction to lock the auction row forces the second to wait until the first commits or rolls back. The original code used plain `findUnique`, which does not lock anything.

The same problem existed in the wallet: two withdrawals could both read the balance, both see enough money, and both proceed. The balance would go negative.

**3. The auto-bid engine had nested transactions.**

Auto-bidding is when a user says "keep bidding on my behalf up to ₹10,000." When someone else bids, the system should automatically counter. The original implementation called `placeBid` recursively from inside a `processAutoBids` function. `placeBid` itself opened a Prisma transaction. So you had a transaction inside a transaction — which Prisma does not support as nested interactive transactions. Under load this either silently flattened (meaning the inner transaction was not actually isolated) or deadlocked.

Worse, the auto-bid trigger used `setImmediate(() => processAutoBids(...))` — a fire-and-forget call that happened after the outer transaction committed. If the process crashed between commit and auto-bid execution, the auto-bid never ran. No retry, no durability.

**4. The sealed-bid privacy was broken.**

For sealed-bid auctions, bidders are supposed to be anonymous during the bidding period — you should not be able to see who else is bidding or how much. The code attempted to implement this with:

```typescript
bidder: isSealed ? { select: { id: true, name: false } } : ...
```

This is a Prisma mistake. In Prisma's `select` syntax, setting a field to `false` does nothing — you must simply not include it in the select. The `name: false` line was silently ignored, and names were still returned in the response. Every bid in a sealed auction showed everyone's identity.

**5. The documentation was fiction.**

The project had documentation files (`bible.md`, `done.md`) that claimed features which did not exist in the code. Things like "EscrowService — centralized settlement, fully implemented" or "FOR UPDATE row locks in placeBid — race condition fixed." The code had none of these. The docs were aspirational, written as if the features were done when they were not.

This mismatch between documentation and reality is common in student projects. It is also how technical debt builds invisibly.

---

## The Decision: From CRUD to Research-Worthy

After the audit, we had a choice. We could accept the teachers' verdict — submit the project as-is, call it a learning experience, move on. Or we could use the problems we'd found as a roadmap to build something genuinely impressive.

We chose the second path. And we set ourselves a specific, audacious goal:

> Turn AuctionHaus into something that can support an IEEE-style undergraduate research paper.

The research angle we identified was: **real-time shill-bidding detection**. Not after an auction ends — during the auction, as bids arrive, in under a millisecond per bid, so the system can intervene.

This was a real research gap. Every paper we found in the literature operated post-hoc on completed auction logs. None of them could do anything while the auction was still live. If we could build an in-process, streaming fraud detector, we would have something nobody else had published for undergraduate-scale platforms.

The plan was structured into phases:

- **Phase A:** Fix every bug. Make the code match the documentation.
- **Phase B:** Make the UI so good that a teacher opens the browser and immediately says "oh."
- **Phase C:** Build the research contribution — the fraud engine, the simulator, the evaluation, the paper.
- **Phase D:** Deployment docs and the viva preparation.
- **Phase E:** Fine-tune the concurrency and auto-bid engine. Write the second paper.
- **Phase F:** Make the live bidding UI feel genuinely real-time and production-grade.
- **Phase RP:** Reconcile the code with the submitted paper after the review process.

The rest of this book tells the story of each phase in detail, explaining not just what we built but why every decision was made the way it was.

---

## Why This Matters Beyond College

You might read this and think: "it's a college project, why does any of this matter?"

Here is why: every problem in the original AuctionHaus codebase is a problem that exists in real production systems. Companies have lost real money to floating-point wallet bugs. Real platforms have had race conditions that let the same item be "won" by multiple bidders simultaneously. Real fraud detection systems run post-hoc and cannot intervene in time. Real auto-bid systems either skip the per-increment log or use broken nested transactions.

The techniques we implemented — pessimistic row locking, Decimal arithmetic, atomic ladder protocols, streaming graph feature extraction, cryptographic commitments — are all industry-standard solutions to these industry-standard problems. Learning them on a college project is learning to build things that matter.

That is the spirit of this book.

---

## Next Chapter

In Chapter 2, we step back from the code entirely and look at AuctionHaus as a product. What does a user experience when they use it? What are the three auction types and how do they differ? That context is essential before we dive into how it works.
