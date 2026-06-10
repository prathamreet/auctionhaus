# Frontend Review and Suggestion Report

This document reviews the frontend codebase (`front/`) and related backend-frontend lifecycle integration boundaries. It identifies bugs, UX discrepancies, and security/financial safety considerations.

---

## 1. Critical UX Bug: Unsold / Reserve-Not-Met Auctions Display Seller as Winner
* **File Reference:** `front/src/app/auctions/[id]/_components/WinnerCertificate.tsx` (Lines 21-22)
* **Description:** 
  When an auction ends but does not meet the reserve price, the backend sets `winnerId` to `null`. On the frontend, if the seller views this ended auction, the `PricePanel` renders the `WinnerCertificate` (since `isSeller` is true). 
  Inside `WinnerCertificate.tsx`, the winner's name falls back to the seller's name:
  ```typescript
  const winnerName = auction.winner?.name ?? auction.seller?.name ?? "Winner";
  ```
  Consequently, it displays **"Winner: [Seller Name]"** and issues a **"CERTIFIED"** badge to the seller for their own unsold lot.
* **Impact:** High confusion for sellers, who are told they won their own auction.
* **Suggested Fix:**
  Prevent rendering the certificate if `auction.winner` is null/undefined, or display an "Unsold / Reserve not met" state instead of falling back to the seller's name.

---

## 2. Critical Financial / Bid Status Leak: Top Bidder Shown as Winner (Frozen Funds)
* **File Reference:** `front/src/app/dashboard/page.tsx` (Lines 297-300), and `back/src/workers/index.ts`
* **Description:** 
  If an English auction ends and the reserve price is not met, the backend's `endAuction` worker correctly decides that there is no winner. However:
  1. The top bidder's bid status in the database is never updated from `WINNING` to `LOST` or `OUTBID`.
  2. The top bidder's locked funds are never refunded from `heldAmount` back to `balance` (since the settlement/refund block is skipped when there's no winner).
  3. On the frontend dashboard, `BidRow` maps the status of any bid that is `WINNING` on an `ENDED` auction to `WON`:
     ```typescript
     const displayStatus =
       bid.status === "WINNING" && bid.auction?.status === "ENDED"
         ? "WON"
         : bid.status;
     ```
* **Impact:** 
  * The bidder's dashboard claims they "WON" the auction.
  * Their profile shows no won auction (because `winnerId` on the auction is null).
  * Their bid funds remain frozen in `heldAmount` permanently.
* **Suggested Fix:**
  In `back/src/workers/index.ts`'s `endAuction` routine, if `metReserve` is false, run a transaction that:
  - Updates the top bid's status to `LOST` or `OUTBID`.
  - Decrements the bidder's `heldAmount`, increments their `balance`, and writes a `BID_RELEASE` transaction log.

---

## 3. UI/UX Discrepancy: Incorrect Transaction Row Status Tones
* **File Reference:** `front/src/app/wallet/page.tsx` (Lines 328-351)
* **Description:** 
  In the transaction list, the `txTone` helper returns `"danger"` for all `PAYMENT` type transactions:
  ```typescript
  case "WITHDRAWAL":
  case "BID_HOLD":
  case "PAYMENT":
    return "danger";
  ```
  However, a `PAYMENT` transaction can represent a **credit** (e.g., a seller receiving payouts from ended auctions) or a **debit** (e.g., a buyer paying for a lot). 
* **Impact:** Sellers who receive a payout see the transaction styled in red/danger, which looks like a loss or error.
* **Suggested Fix:**
  Modify `txTone` or the rendering logic to evaluate the sign of `tx.amount`:
  - If `tx.amount >= 0` (or `tx.type === "PAYMENT"` and positive), use `"success"`.
  - If `tx.amount < 0`, use `"danger"`.

---

## 4. UI Stability: Unstable Keys for Ephemeral Bid History Banner
* **File Reference:** `front/src/app/auctions/[id]/page.tsx` (Lines 167-172)
* **Description:** 
  When a bid ladder updates, a toast key is generated using `d.serverTs ?? Date.now()`:
  ```typescript
  setLatestLadder({
    rungs,
    fromPrice,
    toPrice: d.finalPrice,
    key: `ladder-${d.serverTs ?? Date.now()}`,
  });
  ```
  If `serverTs` is missing from the socket update payload, `Date.now()` is evaluated, which changes on every subsequent render, causing the banner component to remount, flash, or disrupt screen-readers.
* **Suggested Fix:**
  Fallback to a stable identifier, such as `d.lastBidId` or a hash of the auction status, rather than `Date.now()`.

---

## 5. Security Check: Sealed Bid Details Visibility
* **File Reference:** `front/src/app/auctions/[id]/_components/BidHistory.tsx`
* **Description:** 
  While active, the bids list on a Sealed Bid auction is filtered to only show the user's own bid. However, if the client makes an independent call to `/bids/auctions/:id` and the backend does not enforce sealed-bid privacy on that endpoint, a malicious user could inspect all competing bids using browser developer tools.
* **Suggested Fix:**
  Audit the backend's `/bids/auctions/:id` controller to ensure it rejects or filters out bids if the auction is of type `SEALED_BID` and is still active.
