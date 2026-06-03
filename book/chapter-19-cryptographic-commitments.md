# Chapter 13 — Cryptographic Sealed-Bid Commitments

## The Privacy Problem in Sealed-Bid Auctions

A sealed-bid auction has one rule: nobody knows anyone else's bid until the auction closes. This is what makes it fair — you bid your honest valuation without being influenced by what others are bidding.

In a naive implementation, the server knows everyone's bids. The server (or anyone who can read the database) could see that Alice bid ₹50,000 and Bob bid ₹30,000, and could use that information to advise the seller, tip off preferred buyers, or conduct other fraud.

Even without malicious server operators, the original AuctionHaus code had a simpler bug: the code that was supposed to hide bids from the API response was broken (the `name: false` Prisma select issue from Chapter 1). Anyone watching the network tab could see all bids.

The cryptographic solution — a **commit-reveal scheme** — provides a mathematical guarantee that bid amounts cannot be revealed before the auction ends, even by the server.

---

## The Concept: Locked Box and Key

Here is the intuition behind a commitment scheme, using a physical analogy:

1. Alice writes her bid on a piece of paper, puts it in a locked box, and gives the box to the auctioneer.
2. The auctioneer cannot open the box — they do not have the key.
3. When the auction closes, Alice reveals the key. The auctioneer opens the box and reads the bid.
4. Alice cannot change her bid after giving over the box (she is **committed**).
5. The auctioneer cannot read the bid before Alice reveals the key (the bid is **hidden**).

In cryptography, the "locked box" is a cryptographic hash function. The "key" is a random value called a nonce.

---

## The SHA-256 Commitment Protocol

### Commit Phase (During Bidding)

The client:
1. Chooses a bid amount in paisa (integer cents), e.g., `5000000` (₹50,000 = 50,000 × 100 paisa)
2. Generates a random 32-byte nonce: `nonce = crypto.randomBytes(32).toString('hex')`
3. Computes the commitment hash: `H = SHA-256(amount.toString(16) + ":" + nonce)`
   - Amount is in hexadecimal to avoid decimal formatting inconsistencies
   - The colon ":" is a separator to prevent length extension attacks
4. Sends `H` (the hash) to the server via `POST /api/bids/auctions/:id/commit`

The server stores `H` in the `BidCommitment` table. It does NOT store the amount.

### Reveal Phase (After Auction Ends)

After the auction status becomes ENDED, the bidder:
1. Sends `{ amount, nonce }` via `POST /api/bids/auctions/:id/reveal`
2. The server recomputes `H' = SHA-256(amount.toString(16) + ":" + nonce)`
3. The server compares `H'` with the stored `H`
4. If they match: `isValid = true`, `revealedAmount` is stored
5. If they do not match: `isValid = false` (tampered commitment)

The winner is the bidder with the highest valid `revealedAmount`.

---

## The Security Properties

### Hiding

The commitment hash `H = SHA-256(amount || nonce)` reveals nothing about the amount.

SHA-256 is a cryptographic hash function. Given `H`, it is computationally infeasible to find `amount` without also knowing `nonce`. The nonce is a random 32-byte value — 2^256 possible values — so there are astronomically many possible (amount, nonce) pairs that could produce any given hash. Without knowing the nonce, the server cannot determine the amount by brute force.

Mathematically: `P(amount | H) ≈ P(amount)` — seeing the hash gives no information about the amount (assuming the nonce is truly random and the hash is a good pseudorandom function, which SHA-256 is for practical purposes).

### Binding

Once the bidder has submitted `H`, they cannot change their amount for the reveal.

Because SHA-256 is collision-resistant: it is computationally infeasible to find `(amount', nonce')` such that `SHA-256(amount' || nonce') = SHA-256(amount || nonce)` for a different `amount'`.

This means: even if Alice wants to change her bid after seeing that Bob revealed ₹50,000, she cannot find a different `(amount', nonce')` that produces the same `H` she submitted. She is bound to her original amount.

---

## Implementation Details

### Hash Function Choice: SHA-256

SHA-256 is part of the SHA-2 family, designed by NIST. It produces a 256-bit (32-byte) output. It is:

- **Preimage resistant**: Given `H`, cannot find `m` such that `SHA-256(m) = H`
- **Second-preimage resistant**: Given `m`, cannot find `m' ≠ m` such that `SHA-256(m) = SHA-256(m')`
- **Collision resistant**: Cannot find `m, m'` such that `SHA-256(m) = SHA-256(m')`

These three properties together give us hiding and binding.

In Node.js:
```typescript
import { createHash } from 'crypto';

function hashCommitment(amountCents: number, nonce: string): string {
  return createHash('sha256')
    .update(`${amountCents.toString(16)}:${nonce}`)
    .digest('hex');
}
```

### Why Hexadecimal for Amount?

If we used decimal: `SHA-256("50000:abc123")`. An adversary might try to vary the amount slightly and see if the hash still matches some known commitment — fishing for the nonce with a known-amount attack. Using hex: `SHA-256("c350:abc123")` for ₹50.00 (in paisa). This is functionally equivalent in security but avoids any confusion about whether `50000` could be misread as paisa vs rupees.

### The CommitmentPanel UI

The frontend has a `CommitmentPanel.tsx` component for sealed-bid auctions that:
1. Shows a form for entering the bid amount
2. Generates the nonce in the browser: `window.crypto.getRandomValues()`
3. Computes the hash client-side before sending (the hash, not the amount, goes to the server)
4. Stores the `{ amount, nonce }` pair in localStorage under a key per auction
5. After auction ends, shows the stored commitment and provides a "Reveal" button

The localStorage storage is important: if the user closes the browser, they need to be able to retrieve their nonce for the reveal phase. Without the nonce, they cannot reveal their bid (the server cannot help them — it never saw the nonce).

---

## The Limitation: Range Proofs

The SHA-256 commitment scheme has one significant limitation: the server cannot verify that `amount >= reservePrice` without seeing the amount.

Why does this matter? In a regular auction, the server knows the bid amount immediately and can reject a bid below the reserve. In the commit-reveal scheme, the server only sees the hash. A bidder could commit a bid of ₹0 (or even a negative amount!), pass the commit phase, and then reveal it after everyone else has revealed — gaming the system.

The proper solution is **Pedersen commitments** combined with **Bulletproof range proofs** (Bünz et al., 2018).

A Pedersen commitment is `C = g^amount * h^nonce mod p` where `g, h, p` are public group parameters. It provides hiding and binding just like SHA-256, but with an extra property: you can prove to someone that `amount` is in a range [0, MAX] without revealing `amount`. This is a zero-knowledge proof.

Bulletproofs are an efficient construction for range proofs — you can prove `amount ∈ [1, 2^64]` with a logarithmic-size proof, without any trusted setup.

Why did we not implement Pedersen + Bulletproofs? Because it requires:
- A zero-knowledge proof library (e.g., `snarkjs` or a Rust crate via WASM)
- Significant additional math to implement correctly and securely
- Much larger proof sizes and verification overhead

For a college project with a working deadline, SHA-256 commitments provide the core security properties (hiding and binding) and demonstrate the concept. The limitation is acknowledged in the paper's security analysis section and listed as future work.

---

## The Original Privacy Bug (What We Fixed)

Before Phase C6, the sealed-bid "privacy" was implemented as:

```typescript
// bid.service.ts (original, broken)
bidder: isSealed ? { select: { id: true, name: false } } : { select: { id: true, name: true } }
```

In Prisma, `select` works by inclusion: you list the fields you want. `name: false` is silently treated as not specifying `name` at all, which in Prisma's include syntax means "include everything by default." So `name: false` was a no-op and names were always returned.

The correct fix:
```typescript
bidder: isSealed ? { select: { id: true } } : { select: { id: true, name: true } }
```

Or, after Phase C6: return `bidder: null` entirely for sealed bids during the active phase.

---

## The Commit-Reveal Contract

The full protocol as a table:

| Phase | Client Action | Server Action |
|-------|--------------|---------------|
| Commit (ACTIVE) | Compute `H = SHA-256(amount_hex : nonce)` | Store `BidCommitment { commitHash: H }` |
| Wait | N/A | Auction runs; server sees only hashes |
| Reveal (ENDED) | Send `{ amount, nonce }` | Recompute H', compare H' vs H, set `isValid`, store `revealedAmount` |
| Winner determination | N/A | Find highest valid `revealedAmount` |

---

## Next Chapter

Chapter 14 explains the frontend — how Next.js App Router works, the 13-primitive design system, dark mode without flash, the BidChart component, and the live bidding UI that earned Phase F its name.
