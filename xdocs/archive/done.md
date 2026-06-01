
# done

## Phase 1: Critical Backend Bug Fixes (From QA Report & Errors)
- [x] **Data Lock**: Fix Sealed Bids locked on auction cancellation. Update `cancelAuction` in `auction.service.ts` to refund both `WINNING` and `ACTIVE` bid statuses.
- [x] **Race Condition**: Fix concurrent `buyNow` race conditions. Move the `auction.status` check inside `prisma.$transaction` in `buyNow`.
- [x] **Race Condition**: Fix double escrow processing. Move the `existing` payment validation check inside `prisma.$transaction` in `endAuction()`.
- [x] **Logic Fix**: Fix Dutch Auction Time Drift. Update `processDutchPriceDrops` to schedule drops correctly using `Math.floor((now - updatedAt) / intervalMs)`.
- [x] **Logic Fix**: Fix false Dutch errors. In `placeBid`, change `amount !== auction.currentPrice` to `amount <= auction.currentPrice` for Dutch auctions to account for network latency.
- [x] **Logic Fix**: Fix `/buy-now` API bypass on `DUTCH` and `SEALED_BID` auctions. Validate and block these action types early.
- [x] **Logic Fix**: Block users from lowering their own sealed bids (enforce `amount > existingBid.amount`). 
- [x] **Cache Flush**: Add `userCache` invalidation in `admin.service.ts` when a user is suspended.
- [x] **Database Connection Drops**: Fix `P1001` Neon DB Database Connection timeout errors (seen in `errors.md`). Optimize Prisma connection pool management or add robust retry logic.

## Phase 2: Architecture & Optimization Hardening (From Suggestions)
- [x] **Financial Precision**: Update Prisma schema to use `Decimal` or `Int` (cents) for all monetary fields instead of `Float` to avoid IEEE 754 precision bugs.
- [x] **Socket Security**: Strip down Socket.io event emissions to minimal DTO payloads to prevent network bloat and data leakage.
- [x] **Search Optimization**: Replace the ILIKE (`contains`, `insensitive`) pattern in `getAuctions` with proper PostgreSQL Full-Text Search indexing.
  

## Phase 2.5: Deep Code Audit Findings (Backend Concurrency & Edge Cases)
- [x] **Unrefunded Reserve Fails**: In `endAuction`, if an English auction ends without meeting the `reservePrice` (`winner = null`), the `WINNING` bid's held funds are permanently locked. Needs a refund flow for the highest bidder.
- [x] **Buy Now Fund Locks**: In `buyNow`, the auction transitions to `ENDED`, but existing `WINNING` bids (from normal bidding) are never refunded since `endAuction` won't run. Their funds become permanently locked.
- [x] **Phantom Reads in Bidding**: `placeBid` lacks row-level locking or optimistic concurrency. In a default `READ COMMITTED` isolation level, two rapid concurrent bids can read the exact same `auction.currentPrice` and both bypass the `minIncrement` validation.
- [x] **Auto-Bid Tie Breakers**: The mathematical `processAutoBids` relies on `maxAmount: 'desc'` for sorting. If two users have the *exact same* `maxAmount`, the system must break the tie by adding `createdAt: 'asc'` to reward the earliest backer.
- [x] **Orphan Data on Deletion**: `schema.prisma` lacks proper `onDelete: Cascade` rules for `Auction` and `Bid` models, meaning user accounts cannot be cleanly deleted without manual DB cleanup.
- [x] **Negative Guardian**: Wallet `heldAmount` or `balance` lacks a `>= 0` database-level check constrain, allowing potential negative balances in edge case transaction failures.

## Phase 2.6: Backend Architectural Refinement & Security (Auditor Findings)
- [x] **Fix Sealed Bid Leak**: Mask `currentPrice` in APIs and WebSockets for `ACTIVE` sealed auctions to ensure true bidding privacy.
- [x] **Fix Wallet "Double-Hold" Logic**: The `availableBalance` calculation in `placeBid` and `withdraw` incorrectly double-deducts the `heldAmount`. This prevents users from spending or withdrawing their actual liquid funds.
- [x] **Fix `endAuction` Race Condition**: Move the status check inside the transaction and use `FOR UPDATE` to prevent double-settlement.
- [x] **Buy-Now Credit Reuse**: Allow users with existing `WINNING` bids to use their held funds toward a `buyNow` purchase price.
- [x] **Centralize Escrow Settlement**: Consolidate the payout logic from `auction.scheduler.ts` and `payment.service.ts` into a single `EscrowService` to prevent financial logic drift.
- [x] **Notification Race Hazard**: Refactor the notification cap (`MAX_NOTIFICATIONS`) to avoid race conditions during high-frequency bidding events.
- [x] **Dutch Buyer Auto-Snipe**: Implement backend logic to support buyers pre-setting a target price for Dutch auctions (auto-buying when the price drops).



## Phase 2.7: Advanced "Pro" Audit Findings (Architecture, Security & Financial Integrity)
- [x] **[Critical] Fix Manual Dutch Bid Settlement**: Manual bids on Dutch auctions (via `placeBid`) mark the auction as `ENDED` but never call `EscrowService.settleAuction`. Funds are held but never transferred to the seller.
- [x] **[Critical] Fix `buyNow` Bidder Refunds**: Update `buyNow` in `auction.service.ts` to find and refund *all* other active/winning bidders. Currently, buyout only handles the buyer, leaving others' funds locked forever.
- [x] **[High] Fix Sealed Bid Information Leak**: Randomize or sort by `createdAt` in `getAuctionBids` when an auction is `SEALED_BID` and `ACTIVE`. Currently, `orderBy: amount desc` leaks the ranking even if amounts are masked.
- [x] **[Medium] Implement Financial Ledger Trail**: Update `endAuction`, `cancelAuction`, and `placeBid` (refund flow) to create `Transaction` records of type `BID_HOLD` and `BID_RELEASE`. Currently, releases/refunds happen without a ledger entry.
- [x] **[Medium] Optimize `setAutoBid` Balance Logic**: Account for `heldAmount` in the current auction when validating balance. A winning bidder should be able to increase their auto-bid limit using their already-held funds.
- [x] **[Low] Hardened Rating Relations**: Add a proper Prisma `@relation` between `Rating` and `Auction` with `onDelete: Cascade`.
- [x] **[Low] Secure Rating Context**: Validate in `rateUser` that the rater was the winner/seller and the auction is actually `ENDED`.
- [x] **[Low] Atomicity in Rating Updates**: Wrap `rating.create` and `user.update` (for avg rating) in a `prisma.$transaction`.
- 
## Phase 2.8: Pro Audit Round 2 (Concurrency, Integrity & Scaling)
- [x] **[High] Fix Wallet Withdrawal Race**: Add `FOR UPDATE` lock to the wallet row in `withdraw` in `wallet.service.ts` to prevent bypass of balance checks under concurrent requests.
- [x] **[High] Auto-Bid Fallback Resilience**: Fix `processAutoBids` to iterate through the viable contenders list if the top-ranked bidder fails (e.g. insufficient funds). Currently, the system just stops if the first one fails.
- [x] **[Medium] Ledger Gaps in Sealed Revisions**: Add `BID_RELEASE` and `BID_HOLD` transaction records in `bid.service.ts` for sealed bid updates to maintain a complete financial audit trail.
- [x] **[Medium] Admin Activation Safety**: In `moderateAuction`, validate that the `endTime` is still in the future before activating a previously pending auction.
- [x] **[Medium] Distributed Auth Cache Risk**: Add an inheritance check or manual expiry to `userCache` in `auth.middleware.ts` to mitigate stale suspension states (Shortened TTL or manual eviction confirmed).
- [x] **[Medium] Prevent Duplicate Dutch Socket Events**: Add a light coordination check or idempotency flag in `processDutchPriceDrops` to prevent multiple scheduler nodes from emitting duplicate price-drop events.
- [x] **[Low] Optimize Watchlist Deletion**: Refactor `removeFromWatchlist` to use a single `delete` call with error handling instead of `findUnique` + `delete`.
- [x] **[Low] Sync Admin Search with FTS**: Update `getAllUsers` in `admin.service.ts` to use proper Full-Text Search indexing instead of `contains/insensitive` mode for parity with auction search performance.


## Phase 2.9: Pro Audit Round 3 (Concurrency, Integrity & Scaling)

## 🔴 Critical Bugs (Financial & Integrity)
- [x] **Fix Sealed Bid Double-Refund**: In `bid.service.ts`, the wallet update for releasing old holds during a bid revision is duplicated (Lines 80-93), causing users to get double their money back.
- [x] **Fix Duplicate Notifications**: Both `EscrowService.settleAuction` and `auction.scheduler.ts` (endAuction) send `AUCTION_WON` and `PAYMENT_RECEIVED` notifications. Centralize this to avoid spamming users.
- [x] **Escrow Service Reliability**: Add explicit wallet existence checks and error handling in `EscrowService.settleAuction`. Currently, it fails silently or partially if a wallet record is missing, leading to inconsistent ledger states.
- [x] **Nested Transaction Deadlock Risk**: `processAutoBids` (auto-bid.service.ts) calls `placeBid` (bid.service.ts) inside a transaction. Both use `prisma.$transaction`. This can cause deadlocks or Prisma errors as nested transactions aren't supported this way.

## 🟠 High Severity (Logic & Concurrency)
- [x] **Dutch Auction Race Condition**: Possible race between a manual `placeBid` and the `processDutchPriceDrops` scheduler. If a manual bid comes in exactly as a sniper is being processed, one might fail or both might try to settle.
- [x] **Transaction Loop Performance**: `EscrowService` and `Scheduler` process refunds/settlements in a `for` loop inside a transaction. For auctions with 100+ bids, this will hit database timeouts. Refactor to batch updates or process refunds outside the main settlement transaction.
- [x] **Dutch EndTime Discrepancy**: `createAuction` calculates Dutch `endTime` based on `startingPrice` -> `reservePrice`. It should also consider `autoAcceptAmount` if provided, as the auction might end sooner.

## 🟡 Medium Severity (UX & Architecture)
- [x] **Sealed Bid Privacy Leakage**: Blind masking is done manually in controllers. Move masking logic to a central DTO/Transformer to ensure `currentPrice` and bidder details never leak through new endpoints.
- [x] **Production CORS Strategy**: `index.ts` uses a single `FRONTEND_URL`. For production, this should support an array of allowed origins to handle multiple subdomains or staging environments.
- [x] **Global Rate Limiter Refinement**: The current global rate limiter is too broad. Apply stricter limits to `auth/login` and `bids/place` while loosening it for `health` and public `get` requests.
- [x] **Dynamic Import Overhead**: `import('../modules/payments/escrow.service')` is called inside high-frequency transactions/loops. Move to a more efficient singleton or dependency injection pattern.

## Phase 6: Final Hardening (The 100/100 Score)
- [x] **DB-Level Financial Safety**: Add manual SQL migration for `CHECK (balance >= 0 AND heldAmount >= 0)` to prevent any logic bug from creating debt.
- [x] **Atomic Idempotency**: Move the settlement guard (transaction existence check) inside `EscrowService.settleAuction` to protect all entry points (Manual Bid, Auto-buy, Scheduler).
- [x] **Structured Logging & Audit Trail**: Implement `Winston` with a separate file for `financial.log` to track every escrow movement with high precision.
- [x] **Advanced Health Monitoring**: Update `/health` to verify DB connectivity, socket server load, and scheduler heartbeat.
- [x] **Data Hygiene & Security**:
    - [x] Add a Zod-based strong password policy.
    - [x] Implement a global Prisma middleware or utility to strip `password` fields from ALL API responses automatically.
- [x] **Search & Performance Optimization**: 
    - [x] Add GIN indexes for Full-Text Search on `auctions (title, description)`.
    - [x] Indicies on `Bid(auctionId, status)` and `Notification(userId, isRead)`.
- [x] **Graceful Error Handling**: Enhance `error.middleware` to mask database error details in production while keeping full traces in dev.

## Phase 3: Frontend Component Re-Alignment
- [x] **Dutch Auction Flow**: Remove "auto accept limit" from the seller's auction creation form. This should be an interface feature for **buyers** on `/auction/[id]` (allowing them to pre-set a trigger to buy when the price drops to a specific point).
- [x] **Form Validations**: Re-verify all client-side bidding forms and input edge cases align smoothly with the newly patched backend constraints.

## Phase 4: UX & Privacy Fixes
- [x] **Seller Profiles**: Update seller dashboards to display all past listings (active and expired/unsold).
- [x] **Dashboard Tweaks**: Include precise dates, times, prices, and status badges directly on the `/dashboard` cards.
- [x] **Privacy Controls**: Redact sensitive "Winner Details" from the public `/auction/[id]` page. Only display the Winner's Name and Final Price. Ensure detailed certificates and info are strictly reserved for the winner's private profile.

## Phase 5: 
- [x] `/auction` should have past auction list too 
- [x] when no one wins and auction terminates due to reserve price, it should also be in past auction list with status "UNSOLD"
- [x] if a sellers auction is not sold, should be acceptable to seller user friendly like "Unsold" instead of not won like that.


## phase 7 
- [x] the auction is not in real time , when ever i increment the price of bit it do not reflect in other account's bit, in real time.. why is that, check everything socket and crons, make sure its real time 

- [x] when user one bid 1000rs user two and three wait 20 second on their protal then the users one's bid get reflected in their protal, why is that, check everything socket and crons, make sure its real time 

- [x] check backend is completed or not — YES, all 10 modules complete (auth, auctions, bidding, auto-bid, wallet, notifications, watchlist, admin, payments, users)
- [x] start building frontend and complete it end to end for production — DONE, all pages functional (home, auctions, auction detail, create auction, dashboard, profile, wallet, watchlist, notifications, admin, login, register, public user profile)
- [x] make admin dashboard well, and user profile well — DONE, admin panel rewritten with tabbed UI (users/auctions/fraud), real-time socket updates, consistent design system; profile page has won auctions, transactions, verification certificates
- [x] focus on real time logic and performance based on socket io and webhooks — DONE, socket.io listeners on all relevant pages (auction detail, catalogue, dashboard, admin, notifications, navbar badge), query invalidation on socket events instead of polling
- [x] reduce api calls and make it efficient — DONE, removed unnecessary polling, socket-driven cache invalidation, staleTime tuning, centralized parseApiError utility

# bugs fixed (from frontend_suggestion.md QA report)

- [x] BUG #1 (Critical): Auction card timer hydration — moved Date.now() into useEffect with state, timers now tick live
- [x] BUG #2 (High): WebSocket badge desync — notification badge no longer increments when user is already on /notifications
- [x] BUG #3 (Medium): Missing bid validation — client-side validation for English (>= currentPrice + minIncrement) and Sealed (> startingPrice) before API call
- [x] BUG #4 (Medium): Missing withdrawal validation — checks amount > available balance before API call
- [x] BUG #5 (Medium): buyNow uses alert() — replaced with inline error banner via setBidErr, consistent with rest of page UX
- [x] BUG #6 (Minor): Set state in effect warning — badge increment now conditional on pathname
- [x] BUG #7 (Minor): Auction creation state bleed — irrelevant fields cleared when switching auction type
- [x] Centralized error parsing — parseApiError() utility added to lib/api.ts, used across all pages (login, register, profile, wallet, auction detail)


- [x] Next.js Middleware route protection — prevents content flash on protected routes (/dashboard, /wallet, /admin, etc.)
- [x] Cookie sync for middleware — ah_logged_in cookie set/cleared on login/logout/hydrate
- [x] Socket reconnect on auth change — reconnectSocket() called on login/register, disconnectSocket() on logout
- [x] Seller cancel auction — sellers can cancel PENDING/ACTIVE auctions from auction detail page
- [x] User rating system — winner rates seller, seller rates winner after auction ends (star rating + optional comment)
- [x] Admin: auction moderation — Cancel active auctions, Activate pending auctions via /admin/auctions/:id/moderate
- [x] Admin: paginated auctions — uses proper GET /admin/auctions endpoint instead of dashboard stats
- [x] Admin: user search — search input filters users via backend search param
- [x] parseApiError utility — used across ALL pages (login, register, profile, wallet, auction detail, create, dashboard)