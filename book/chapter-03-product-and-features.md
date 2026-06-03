# Chapter 2 — The Product and Its Features

## What Is AuctionHaus?

AuctionHaus is a real-time auction platform. Think eBay, but simpler, and with three auction formats instead of one. Users can list items for sale, bid on other people's items, manage a digital wallet, set automatic bidding limits, and receive live notifications as events happen. Administrators can view platform statistics, suspend bad actors, and monitor a real-time fraud detection dashboard.

The name "AuctionHaus" is a nod to the German auction tradition — "haus" means "house," as in auction house.

---

## The Three Auction Types

The most interesting design decision in AuctionHaus is that one `Auction` database row supports three fundamentally different auction formats. Understanding what each type is and how it works is essential before understanding the code.

### English Auction (Ascending Price)

This is the auction you have seen in every movie: the auctioneer starts at a low price and people keep bidding higher. The highest bidder when time runs out wins.

In AuctionHaus, an English auction has:

- A **starting price** (the minimum first bid)
- A **minimum increment** (each bid must be at least this much above the current price)
- An **end time** (the auction closes at this moment)
- An optional **buy-now price** (a bidder can skip the auction and pay this fixed amount immediately)
- An optional **reserve price** (if the final bid does not reach this amount, no sale happens)
- **Anti-sniping protection**: if someone bids in the last N minutes before the end time, the end time extends by N more minutes. This prevents "sniping" — the practice of placing a bid in the last second so nobody has time to respond.

The anti-sniping extension only applies to the manual bid that triggers it. The auto-bid ladder that follows does not extend the time again, by design.

### Dutch Auction (Descending Price)

A Dutch auction works in reverse. The seller sets a high starting price. A BullMQ job runs on a recurring schedule and drops the price by a fixed step every interval. The first person to accept the current price wins immediately — the auction ends at that moment.

In AuctionHaus:

- `dutchPriceStep` defines how much the price drops each interval
- `dutchInterval` defines the interval in seconds
- If the price drops to zero or below the reserve price, the auction ends without a sale

Dutch auctions reward patience: if you want the item but think the price will drop further, you wait — but someone else might accept the current price first. The tension between these two instincts creates the auction dynamic.

### Sealed-Bid Auction (Blind Bidding)

In a sealed-bid auction, all bids are secret. Nobody can see what anyone else bid. When the auction ends, the bids are revealed and the highest bidder wins.

AuctionHaus implements this with a cryptographic commit-reveal protocol (explained fully in Chapter 13). During the bidding period, each bidder submits a cryptographic hash of their amount — a mathematical fingerprint. When the auction ends, each bidder reveals their actual amount and the system verifies that the hash matches. This guarantees the bidder cannot change their amount after seeing others' reveals, and the server cannot peek at amounts during the bidding period.

Before this was implemented, there was a privacy bug: the response was supposed to hide bidder names but the code had `name: false` in a Prisma select, which Prisma silently ignores. Names were visible the whole time.

---

## The Wallet System

AuctionHaus has an internal digital wallet. In a production system, this would connect to a real payment processor. Here, it is a mock payment layer.

### Wallet Fields

Every user has exactly one wallet with two key fields:

- **balance**: The money you can freely spend or withdraw
- **heldAmount**: Money that is locked because of an active bid

When you place a bid, the bid amount is moved from `balance` to `heldAmount`. Your money is not gone, but it is locked. This is the escrow model.

If you get outbid, the held amount is released back to `balance`. If you win, the held amount is transferred to the seller's balance.

### Why This Matters

This escrow design prevents "ghost bids" — bids placed by users who do not actually have the money. Before the escrow was implemented properly, a user could place ten bids across ten auctions simultaneously and only have enough money for one of them. Now, each bid hold locks the specific amount, so if you are winning five auctions simultaneously, all five amounts are held.

### Deposit and Withdraw

Users can deposit money (in the demo, any amount) and withdraw money from their balance (not from held amounts — those are locked). Both operations use pessimistic locks to prevent race conditions, which Chapter 7 explains in detail.

---

## Auto-Bidding

Auto-bidding is one of the most technically interesting features in the product.

When you set an auto-bid limit, you are telling the system: "If someone outbids me, automatically bid on my behalf, but never go above this maximum." This is called proxy bidding — you are not sitting at the screen watching; a proxy bids for you.

Example:
- Current price: ₹1,000
- Minimum increment: ₹100
- You set auto-bid max: ₹5,000
- Someone manually bids ₹1,000
- The system automatically counters at ₹1,100 on your behalf
- They counter at ₹2,000
- The system automatically counters at ₹2,100
- ...and so on until your max is reached

The key UX contract in AuctionHaus is that **every increment is logged as its own bid row**. If the ladder climbs 20 steps, there are 20 bid rows in the database. This is important for fraud detection (the research paper contribution) because shill detection algorithms need a complete bid history to compute features like "how quickly does this bidder respond?" If the ladder jumped in one step from ₹1,000 to ₹5,000, the intermediate responses would be invisible.

This design is what the second research paper (the Atomic Ladder Protocol paper, Chapter 16) is about.

---

## The Admin Panel

Administrators have a separate interface at `/admin`:

- **Dashboard**: Total users, total auctions, total bids, revenue, new users today
- **User list**: View all users, suspend or reinstate accounts
- **Auction list**: View all auctions, cancel any auction
- **Fraud Dashboard**: The research contribution — live stream of fraud:flag events from the detector, feature bars showing why each bid was flagged, a top-flagged-bidders leaderboard, and dismiss/suspend actions

The fraud dashboard is what the teacher should see first when reviewing the project. It is the visible proof that this is not a CRUD app.

---

## Notifications

The notification system delivers real-time messages for:

- Being outbid on an auction
- Winning an auction
- Losing an auction (sealed-bid reveal)
- An auction starting (if it is on your watchlist)
- An auction ending
- An auto-bid being placed on your behalf
- Payment received (for sellers)

Notifications are delivered two ways: stored in the database (so you can see them in the inbox later) and pushed over Socket.io in real time (so a badge updates immediately). The notification worker off-loads this from the request path — bid placement does not pay the cost of writing a notification row.

---

## Watchlist

Users can watch auctions without bidding. When a watched auction starts, they receive a notification. Watchlists create the "window shopping" behaviour that makes auction platforms sticky.

---

## Ratings

After an auction ends and the winner confirms payment, both parties (buyer and seller) can rate each other. Ratings are 1–5 stars with optional comments. A user's average rating is shown on their profile.

---

## The Landing Page

The public landing page shows the three auction types with real copy explaining what they are, a "Browse Auctions" call-to-action, and stack labels (no fake performance badges). It has dark mode support with no flash on load — the theme is read from localStorage before React hydrates.

---

## The User Journey

To make the above concrete, here is a complete walkthrough of one auction from creation to settlement:

1. **Seller** creates an English auction: "Vintage Rolex — Start ₹50,000, Buy-Now ₹80,000, ends in 2 hours"
2. BullMQ schedules an `end-auction` job for 2 hours from now
3. **Buyer A** finds the auction in the catalogue (searched via PostgreSQL full-text search), adds it to their watchlist
4. **Buyer A** deposits ₹60,000 into their wallet
5. Auction goes ACTIVE; Buyer A receives a notification
6. **Buyer B** bids ₹52,000. Buyer A is not watching, but Buyer B's money is held
7. **Buyer A** sets an auto-bid: max ₹70,000. The system immediately counter-bids ₹52,100. Buyer B is notified
8. Buyer B manually bids ₹65,000. Auto-bid ladder runs: ₹65,100 for Buyer A
9. 15 minutes before close, Buyer C bids ₹66,000. The end time extends by 5 minutes (anti-snipe). Buyer A's ladder fires: ₹66,100
10. Time expires. Buyer A wins at ₹66,100. Buyer B gets their ₹65,000 released back to their balance. Buyer A's ₹66,100 held amount transfers to the seller. Both parties can now rate each other.

Every event along this path — bid:new, auction:extended, bid:ladder, auction:ended — was broadcast over Socket.io to everyone watching the auction page in real time.

---

## What Makes This Different from Other Student Projects

Most student auction projects have:
- Auctions with fixed end times, no extension
- Manual bidding only (no auto-bid)
- No escrow (bid does not lock any money)
- No fraud detection (anyone can bid anything)
- No sealed-bid format
- Prices stored as floats (wrong for money)
- No real-time updates (you have to refresh the page)
- No concurrency control (race conditions everywhere)

AuctionHaus has all of those things solved. Plus: a research paper.

---

## Next Chapter

Chapter 3 explains the technology stack — every library, every framework, and the reason behind each choice. This context is critical for understanding why the code is structured the way it is.
