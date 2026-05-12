# AuctionHaus Backend — Full Technical Deep Dive

> Everything you need to understand how this project works, how each piece is implemented, and why decisions were made. Written as a learning reference for your CSE major project presentation.

---

## Table of Contents

1. [Tech Stack & Why](#1-tech-stack--why)
2. [Project Entry Point](#2-project-entry-point)
3. [Database Design (Prisma Schema)](#3-database-design-prisma-schema)
4. [Authentication System](#4-authentication-system)
5. [Auction Module](#5-auction-module)
6. [Bidding Engine (Core Logic)](#6-bidding-engine-core-logic)
7. [Auto-Bid System](#7-auto-bid-system)
8. [Wallet & Mock Payments](#8-wallet--mock-payments)
9. [Real-Time Layer (Socket.io)](#9-real-time-layer-socketio)
10. [Background Jobs (BullMQ)](#10-background-jobs-bullmq)
11. [Notifications](#11-notifications)
12. [Watchlist](#12-watchlist)
13. [Admin Panel](#13-admin-panel)
14. [Middleware Stack](#14-middleware-stack)
15. [Request Lifecycle (End to End)](#15-request-lifecycle-end-to-end)
16. [API Reference](#16-api-reference)
17. [How to Run](#17-how-to-run)

---

## 1. Tech Stack & Why

| Technology             | Purpose          | Why                                                    |
| ---------------------- | ---------------- | ------------------------------------------------------ |
| **Node.js + Express**  | HTTP server      | Simple, fast, widely used                              |
| **TypeScript**         | Language         | Type safety, better IDE support, fewer bugs            |
| **PostgreSQL**         | Primary database | Relational data, ACID transactions, great for auctions |
| **Prisma ORM**         | DB abstraction   | Type-safe queries, auto migrations, great DX           |
| **Redis**              | Cache + Pub/Sub  | Fast in-memory store, BullMQ needs it                  |
| **Socket.io**          | Real-time        | Bidirectional events, room support for auction rooms   |
| **BullMQ**             | Background jobs  | Reliable job queues with Redis, delayed jobs           |
| **bcryptjs**           | Password hashing | Industry standard, salted hashes                       |
| **jsonwebtoken**       | Auth tokens      | Stateless JWT auth                                     |
| **Zod**                | Validation       | Runtime schema validation, pairs well with TypeScript  |
| **Helmet**             | Security         | Sets secure HTTP headers                               |
| **express-rate-limit** | Rate limiting    | Protects against brute force and abuse                 |

---

## 2. Project Entry Point

**File:** `src/index.ts`

This is where everything comes together. Here's what happens in order when you run `npm run dev`:

```
1. Load environment variables (.env)
2. Create Express app
3. Create Node HTTP server (wraps Express)
4. Create Socket.io server (wraps HTTP server)
5. Register all middleware (helmet, cors, morgan, json parser, rate limiter)
6. Register all route modules under /api/*
7. Register error handler (last middleware)
8. Connect to PostgreSQL via Prisma
9. Ping Redis to verify connection
10. Initialize Socket.io gateway (event handlers)
11. Start BullMQ workers
12. Start listening on PORT (default 5000)
```

The key pattern here: **Express sits inside Node's HTTP server, and Socket.io wraps THAT same HTTP server**. This means both REST and WebSocket traffic go through the same port (5000).

```typescript
const app = express();
const httpServer = http.createServer(app);  // HTTP server
const io = new Server(httpServer, { ... }); // Socket.io on same server
```

The `io` (Socket.io server) is attached to each request via middleware so controllers can emit events:
```typescript
app.use((req, _res, next) => {
  req.io = io;
  next();
});
```

---

## 3. Database Design (Prisma Schema)

**File:** `prisma/schema.prisma`

### Models Overview

```
User
 ├── Wallet (1-to-1)
 │    └── Transaction[] (1-to-many)
 ├── Auction[] (as seller)
 ├── Bid[]
 ├── AutoBid[]
 ├── Notification[]
 ├── WatchlistItem[]
 └── Rating[] (sent and received)

Auction
 ├── Bid[]
 ├── AutoBid[]
 └── WatchlistItem[]
```

### Key Design Decisions

**1. Wallet holds `balance` AND `heldAmount` separately**

When a user places a bid, the money is not immediately deducted — it is *held*. This allows them to place competing bids without needing to deposit again.

```
balance = 1000
heldAmount = 300        (for active bid of 300)
available = 1000 - 300  = 700  ← what user can actually spend
```

When user is outbid → `heldAmount` decreases, `balance` goes back up.
When user wins and pays → `heldAmount` decreases, `balance` stays decremented.

**2. Separate `endTime` and `actualEndTime`**

Anti-sniping can extend the auction. `endTime` is the original planned end, `actualEndTime` is what it really ended at (also set when Dutch auction is won by first bid).

**3. `AuctionType` enum covers all 3 types**
- `ENGLISH` — incremental, highest bidder wins
- `DUTCH` — starts high, price drops over time, first taker wins
- `SEALED_BID` — everyone submits blind, revealed at end

**4. `BidStatus` tracks bid lifecycle**
```
ACTIVE    → just placed, auction still open
OUTBID    → someone bid higher (English)
WINNING   → currently the top bid
WON       → auction ended, you won
LOST      → auction ended, you didn't win (sealed bid)
```

**5. AutoBid has `@@unique([auctionId, bidderId])`**

Each user can only have ONE active auto-bid per auction. If they call `setAutoBid` again, it UPSERTs (updates the existing one).

### Prisma Migrations

```bash
npx prisma migrate dev --name init
```

This:
1. Reads `schema.prisma`
2. Computes the SQL diff
3. Generates a SQL migration file in `prisma/migrations/`
4. Applies it to your database
5. Regenerates the Prisma client

---

## 4. Authentication System

**Files:** `src/modules/auth/`

### How JWT Auth Works

```
Client                          Server
  │                               │
  │  POST /api/auth/register      │
  │  { name, email, password }    │
  │──────────────────────────────►│
  │                               │  1. Hash password with bcrypt
  │                               │  2. Store user in DB
  │                               │  3. Auto-create wallet
  │                               │  4. Sign JWT with user id, email, role
  │  { user, token }              │
  │◄──────────────────────────────│
  │                               │
  │  GET /api/users/me            │
  │  Authorization: Bearer <token>│
  │──────────────────────────────►│
  │                               │  1. Extract token from header
  │                               │  2. Verify JWT signature
  │                               │  3. Decode payload (id, email, role)
  │                               │  4. Fetch user from DB to confirm active
  │  { user data }                │
  │◄──────────────────────────────│
```

### Password Hashing

```typescript
// Registration
const hashedPassword = await bcrypt.hash(data.password, 12);
// 12 = salt rounds — higher = more secure but slower

// Login
const valid = await bcrypt.compare(data.password, user.password);
```

`bcrypt` is a one-way hash. You can never get the original password back. The salt rounds (12) mean the hash takes ~250ms to compute — this makes brute-force attacks slow.

### JWT Structure

```
eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InV1aWQiLCJlbWFpbCI6Ii4uLiIsInJvbGUiOiJVU0VSIn0.signature
│── Header ───────────│ │──────────── Payload ────────────────────────────────│ │─ Sig ──│
```

The payload contains: `{ id, email, role }`. The server signs it with `JWT_SECRET`. Anyone can *read* the payload, but can't *forge* a token without the secret.

### Auth Middleware

Every protected route goes through `authenticate`:

```typescript
// 1. Check Authorization header exists
// 2. Extract token
// 3. Verify with jwt.verify() — throws if expired or tampered
// 4. Hit the DB to check user still exists and isn't suspended
// 5. Attach req.user = { id, email, role }
// 6. Call next()
```

Why hit the DB on every request? So if an admin suspends a user, their existing token immediately stops working instead of staying valid until expiry.

### Input Validation with Zod

All request bodies are validated before touching the service layer:

```typescript
const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6),
});

const data = registerSchema.parse(req.body);
// If invalid -> throws ZodError -> caught by error handler -> 400 response
```

---

## 5. Auction Module

**Files:** `src/modules/auctions/`

### Creating an Auction

```typescript
POST /api/auctions
{
  title: "Vintage Rolex",
  type: "ENGLISH",          // ENGLISH | DUTCH | SEALED_BID
  startingPrice: 5000,
  reservePrice: 8000,       // minimum price to actually sell
  buyNowPrice: 15000,       // optional instant buy
  minIncrement: 100,        // minimum raise per bid
  antiSnipingMins: 5,       // extend by 5 mins if bid in last 5 mins
  startTime: "2026-03-01T10:00:00Z",
  endTime: "2026-03-07T10:00:00Z"
}
```

After creation:
1. If `startTime` is in the future → BullMQ job is scheduled with `delay` to flip status to `ACTIVE`
2. If `startTime` is now or past → status is immediately `ACTIVE`
3. A second BullMQ job is scheduled to `end-auction` at `endTime`

### Dutch Auction Specifics

Dutch auctions start at a high price and the price automatically drops over time. First person to accept the current price wins.

```typescript
dutchPriceStep: 50,     // drop price by 50 every...
dutchInterval: 600,     // ...600 seconds (10 minutes)
```

When the start job fires, it also starts a BullMQ recurring job that drops the price every `dutchInterval` seconds.

### Sealed Bid Specifics

- All bids are submitted hidden (bidder identities masked while auction is active)
- When the auction ends, all bids are revealed
- Highest bid wins
- Losers get their held amounts refunded automatically

### Buy Now

```
POST /api/auctions/:id/buy-now
```

Immediately ends the auction. Deducts from buyer's balance, credits seller's balance, records transactions, sets `winnerId`. All in a single `prisma.$transaction()` so either all steps succeed or all fail.

### Pagination & Filtering

```typescript
GET /api/auctions?status=ACTIVE&type=ENGLISH&search=rolex&page=2&limit=10
```

Uses Prisma's `skip` and `take` for offset pagination. Returns `{ auctions, total, page, limit, totalPages }`.

---

## 6. Bidding Engine (Core Logic)

**File:** `src/modules/bidding/bid.service.ts`

This is the most critical piece of the system. Every bid goes through `placeBid()` which runs inside a **Prisma transaction** — meaning either everything succeeds or nothing does. This prevents race conditions like two people both winning the same auction.

### English Auction Flow

```
User calls POST /api/bids/auctions/:id  { amount: 5500 }

1. Fetch auction (inside transaction)
   └─ Validate: ACTIVE, not seller, not past endTime

2. Validate bid amount
   └─ amount >= currentPrice + minIncrement (e.g. 5000 + 100 = 5100 minimum)

3. Check wallet
   └─ (balance - heldAmount) >= amount

4. Find current WINNING bid
   └─ If someone else → mark their bid OUTBID
                      → release their held amount (give balance back)
                      → send outbid notification
   └─ If same person increasing bid → release old hold first

5. Hold new amount
   └─ wallet.balance -= amount
   └─ wallet.heldAmount += amount

6. Create bid record with status WINNING

7. Update auction.currentPrice = amount

8. Anti-sniping check
   └─ If bid placed in last 5 mins before endTime
   └─ Extend endTime by 5 more minutes
   └─ Emit socket event 'auction:extended'

9. Return bid
```

### Dutch Auction Flow

```
1. Validate amount === auction.currentPrice (exactly, no higher)
2. Same wallet check and hold
3. Create bid
4. Set auction status = ENDED, winnerId = bidderId immediately
   (First taker wins)
```

### Sealed Bid Flow

```
1. Validate amount > startingPrice
2. Bid is stored but status hidden from other users
3. No currentPrice update (hidden)
4. Winner revealed only when auction ends (handled by worker)
```

### Anti-Sniping Logic

```typescript
const endTime = new Date(auction.endTime);
const cutoff = new Date(endTime.getTime() - auction.antiSnipingMins * 60 * 1000);

if (now >= cutoff) {
  // Bid placed in the last N minutes → extend
  const newEndTime = new Date(now.getTime() + auction.antiSnipingMins * 60 * 1000);
  auctionUpdateData.endTime = newEndTime;

  io.to(`auction:${auctionId}`).emit('auction:extended', { newEndTime });
}
```

This prevents "sniping" (placing a bid in the last second). If you bid in the last 5 minutes, the clock resets to 5 minutes from now.

### After a Bid is Placed

After `placeBid()` succeeds, the controller:
1. Emits `bid:new` to the auction's Socket.io room (all watching users see it instantly)
2. Calls `processAutoBids()` asynchronously (doesn't block the response)

---

## 7. Auto-Bid System

**File:** `src/modules/auto-bid/auto-bid.service.ts`

### Setting an Auto-Bid

```
POST /api/bids/auctions/:id/auto-bid  { maxAmount: 8000 }
```

The user is saying: *"Keep bidding for me automatically, up to 8000 max."*

This is stored in the `AutoBid` table. The actual bidding happens server-side, triggered every time ANY bid is placed on that auction.

### Priority Queue Algorithm

`processAutoBids(auctionId, currentWinnerId, currentPrice, io)`

```
1. Get all active auto-bids for this auction
   └─ Exclude current winner (they already bid)
   └─ Sort by maxAmount DESC (highest willing bidder first)

2. topAutoBid = first in sorted list

3. Check if topAutoBid.maxAmount >= currentPrice + minIncrement
   └─ If not → they can't afford next bid, skip

4. Calculate actual bid amount:
   └─ If only 1 auto-bidder → bid minimum (currentPrice + increment)
   └─ If 2+ auto-bidders:
       secondBid.maxAmount + increment = amount needed to beat #2
       bidAmount = min(that amount, topAutoBid.maxAmount)
       → Bid only as much as needed to beat the competition

5. Place bid on behalf of topAutoBid.bidderId

6. Emit socket event so watchers see auto-bid in real-time

7. Recursively call processAutoBids again
   → Because now topAutoBid.bidderId is the winner
   → The previous winner might ALSO have an auto-bid
   → Keep resolving until no more outbidding occurs
```

**Example:**
- Alice: maxAmount = 1000
- Bob: maxAmount = 800
- Current price: 500

```
Round 1: processAutoBids() called  
  → Alice (1000) vs Bob (800)
  → Alice needs to beat 800 + 50 = 850
  → Alice bids 850

Round 2: processAutoBids() called (Bob was outbid)
  → Bob has auto-bid, Alice is current winner
  → Bob (800) needs 850 + 50 = 900
  → 900 > Bob's max (800) → Bob can't bid
  → Done. Alice wins at 850.
```

### Auto-Bid Deactivation

If a wallet has insufficient funds when the engine tries to place an auto-bid, it catches the error and marks `isActive = false` on that auto-bid, so it stops triggering.

---

## 8. Wallet & Mock Payments

### Wallet Model

```
Wallet {
  balance     → total funds deposited
  heldAmount  → amount locked due to active bids
}

Available = balance - heldAmount
```

### Mock Deposit/Withdraw

```
POST /api/wallet/deposit   { amount: 5000 }
POST /api/wallet/withdraw  { amount: 1000 }
```

In a real app, this would call Stripe/Razorpay. Here we just directly increment/decrement the balance in the DB and record a transaction. The logic is identical to real escrow — the wallet model is correct, only the payment gateway is mocked.

### Payment Settlement (Winner Confirms)

When an auction ends, the winner confirms payment:
```
POST /api/payments/auctions/:id/confirm
```

What happens:
```
1. Verify auction ended and caller is the winner
2. Check no duplicate payment (idempotency)
3. Find the winning bid amount
4. wallet.heldAmount -= amount  (release the hold)
   (balance was already decremented when bid was placed)
5. seller wallet.balance += amount  (credit seller)
6. Record two Transaction rows (debit for buyer, credit for seller)
7. Update bid status to WON
8. Notify seller of payment received
```

This is essentially **escrow**: money is locked when you bid, released to seller only when auction is confirmed complete.

---

## 9. Real-Time Layer (Socket.io)

**File:** `src/gateway/socket.gateway.ts`

### How Socket.io Works

HTTP is request-response — client asks, server answers. WebSockets are persistent connections — server can push data to client anytime.

Socket.io is built on WebSockets and adds:
- **Rooms** — groups of connections that can receive the same message
- **Events** — named messages with payloads
- **Auto-reconnect** — handles drops gracefully

### Room Architecture

```
auction:{auctionId}  → everyone watching a specific auction
user:{userId}        → personal room for notifications
```

When a user opens an auction page, the frontend calls:
```javascript
socket.emit('auction:join', auctionId);
```

Server adds their connection to `auction:{auctionId}` room.

When a bid is placed via REST:
```typescript
io.to(`auction:${auctionId}`).emit('bid:new', { bid });
```

Everyone in that room receives the `bid:new` event instantly.

### Authentication for Sockets

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    socket.data.userId = null;
    return next(); // unauthenticated connections allowed (read-only watching)
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.data.userId = payload.id;
    next();
  } catch {
    socket.data.userId = null;
    next(); // still allow, just anonymous
  }
});
```

This allows anyone to watch auctions (no login needed) but personal notifications require auth.

### Events Reference

| Direction       | Event                | Payload                    | Description                    |
| --------------- | -------------------- | -------------------------- | ------------------------------ |
| Client → Server | `auction:join`       | `auctionId`                | Subscribe to auction room      |
| Client → Server | `auction:leave`      | `auctionId`                | Unsubscribe                    |
| Client → Server | `auction:sync`       | `auctionId`                | Get current state on reconnect |
| Server → Client | `bid:new`            | `{ bid }`                  | New bid placed                 |
| Server → Client | `auction:extended`   | `{ newEndTime }`           | Anti-sniping triggered         |
| Server → Client | `auction:ended`      | `{ winnerId, finalPrice }` | Auction closed                 |
| Server → Client | `auction:started`    | `{ auctionId }`            | Scheduled auction began        |
| Server → Client | `auction:price-drop` | `{ newPrice }`             | Dutch auction price dropped    |
| Server → Client | `notification:new`   | `{ notification }`         | Personal notification          |

---

## 10. Background Jobs (BullMQ)

**Files:** `src/queues/auction.queue.ts`, `src/workers/index.ts`

### What is BullMQ?

A job queue backed by Redis. You add a **job** to a **queue**, and a **worker** picks it up and processes it. Key features:
- **Delayed jobs** — run after X milliseconds
- **Recurring jobs** — run every N milliseconds
- **Retries** — automatically retry failed jobs
- **Persistence** — survives server restarts (stored in Redis)

### Queues in This Project

```
auction-scheduler  → start-auction, end-auction jobs
dutch-auction      → drop-price jobs (recurring)
notifications      → async notification delivery
```

### Scheduling Auction Start/End

When an auction is created:
```typescript
const startDelay = new Date(data.startTime).getTime() - Date.now();
const endDelay   = new Date(data.endTime).getTime()   - Date.now();

auctionQueue.add('start-auction', { auctionId }, { delay: startDelay });
auctionQueue.add('end-auction',   { auctionId }, { delay: endDelay });
```

The `delay` option tells BullMQ: don't run this job until X milliseconds have passed.

### start-auction Job

```
1. Fetch auction from DB
2. Verify still PENDING (not cancelled)
3. Update status → ACTIVE
4. Emit 'auction:started' socket event
5. If Dutch auction → start recurring 'drop-price' job
6. Notify all watchlist users (auction is live!)
```

### end-auction Job / endAuction Function

```
1. Fetch auction with winning bid
2. Check reserve price: if currentPrice < reservePrice → no winner
3. Update auction: status=ENDED, winnerId, actualEndTime
4. For SEALED_BID:
   - Reveal all bids
   - Mark highest as WON
   - Mark rest as LOST
   - Refund losers (release held amounts)
5. Emit 'auction:ended' to room
6. Notify winner
7. Notify watchlist users
```

### Dutch Price Drop Job (Recurring)

```typescript
dutchAuctionQueue.add(
  'drop-price',
  { auctionId, step: 50 },
  { repeat: { every: 600 * 1000 } } // every 10 minutes
);
```

```
Every 10 minutes:
1. Fetch auction
2. newPrice = currentPrice - step
3. If newPrice <= 0 or < reservePrice → end the auction
4. Otherwise update currentPrice
5. Emit 'auction:price-drop' to room
```

---

## 11. Notifications

**File:** `src/modules/notifications/notification.service.ts`

### Dual Delivery System

Every notification is:
1. **Persisted to DB** — so users can see their notification history
2. **Pushed via Socket.io** — instant delivery if user is online

```typescript
export const notifyUser = async (userId, data) => {
  // 1. Save to DB
  const notification = await prisma.notification.create({ data: { userId, ...data } });

  // 2. Push if online (user:userId room)
  io.to(`user:${userId}`).emit('notification:new', notification);
};
```

If the user is offline, the socket emit goes nowhere — but the DB record is there, so they see it when they next open the app.

### Notification Types

```typescript
enum NotificationType {
  OUTBID           // someone bid higher than you
  AUCTION_WON      // you won!
  AUCTION_LOST     // you lost (sealed bid reveal)
  AUCTION_STARTED  // a watchlisted auction went live
  AUCTION_ENDED    // a watchlisted auction ended
  AUTO_BID_PLACED  // system placed auto-bid on your behalf
  PAYMENT_RECEIVED // seller got paid
  GENERAL          // admin announcements
}
```

---

## 12. Watchlist

**File:** `src/modules/watchlist/`

Simple relationship: `User ↔ Auction` through `WatchlistItem`.

```typescript
@@unique([userId, auctionId])  // can't add same auction twice
```

Uses Prisma `upsert` to safely add without duplicates:
```typescript
prisma.watchlistItem.upsert({
  where: { userId_auctionId: { userId, auctionId } },
  update: {},    // already exists → do nothing
  create: { userId, auctionId },
})
```

Watchlist users are notified when:
- An auction they watch goes live (`AUCTION_STARTED`)
- An auction they watch ends (`AUCTION_ENDED`)

---

## 13. Admin Panel

**File:** `src/modules/admin/`

All admin routes are protected by both `authenticate` AND `requireAdmin`:

```typescript
router.use(authenticate, requireAdmin);
```

`requireAdmin` simply checks `req.user.role === 'ADMIN'`.

### Fraud Detection

A basic heuristic: users who are outbid many times on manual (non-auto) bids are flagged as potentially participating in shill bidding.

```typescript
// Find bidders with > 10 non-auto outbid bids
prisma.bid.groupBy({
  by: ['bidderId'],
  where: { status: 'OUTBID', isAutoBid: false },
  _count: { id: true },
  having: { id: { _count: { gt: 10 } } },
  orderBy: { _count: { id: 'desc' } },
})
```

### Dashboard Stats

Single endpoint that returns:
- Total users, auctions, bids
- Active auction count
- Total revenue from completed payments
- Most recent 5 users and auctions (for a quick overview)

All fetched in parallel with `Promise.all()` to avoid waterfall queries.

---

## 14. Middleware Stack

### How Express Middleware Works

Middleware are functions that run in sequence on every request:

```
Request → [helmet] → [cors] → [morgan] → [json] → [rateLimiter] → [route] → [errorHandler]
```

Each middleware calls `next()` to pass to the next one, or sends a response to short-circuit.

### Middleware in This Project

**1. Helmet**
Sets security HTTP headers automatically (X-Frame-Options, Content-Security-Policy, etc.)

**2. CORS**
Allows requests from the frontend origin only. Prevents unauthorized sites from calling your API.

**3. Morgan**
Logs every request: `GET /api/auctions 200 45ms`. Useful for debugging.

**4. express.json()**
Parses request body from raw JSON string into `req.body` object.

**5. Rate Limiter**
```typescript
// General: 200 requests per 15 minutes
// Strict (auth routes): 10 requests per 15 minutes
```
Prevents brute-force password attacks and API abuse.

**6. authenticate (per-route)**
Only on protected routes. Validates JWT and attaches user to request.

**7. Error Handler (last)**
```typescript
app.use(errorHandler); // MUST be last
```
Catches any error thrown in any route. Returns `{ message, stack (dev only) }`.

The pattern for throwing errors from services:
```typescript
// In any service:
throw createError('Not found', 404);

// createError just makes a normal Error with statusCode attached
const createError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};
```

---

## 15. Request Lifecycle (End to End)

Let's trace a real bid from frontend click to database and back to all watchers.

```
Browser (Alice)                 Server                          Browser (Bob, Charlie)
      │                            │                                    │
      │  POST /api/bids/auctions/  │                                    │
      │  :id { amount: 5500 }      │                                    │
      │  Authorization: Bearer ... │                                    │
      │──────────────────────────►│                                    │
      │                            │ [authenticate middleware]           │
      │                            │  ✓ JWT valid, user = Alice         │
      │                            │                                    │
      │                            │ [bid.controller.placeBid]          │
      │                            │  ✓ Zod validates { amount: 5500 }  │
      │                            │                                    │
      │                            │ [bid.service.placeBid] ◄─ DB tx    │
      │                            │  1. Fetch auction (lock row)       │
      │                            │  2. Validate ACTIVE, not seller    │
      │                            │  3. 5500 >= 5000 + 100 ✓           │
      │                            │  4. Alice.balance(8000)-held(0)✓   │
      │                            │  5. Previous winner: Bob(5000)     │
      │                            │     → Bob.bid status = OUTBID      │
      │                            │     → Bob.balance += 5000          │
      │                            │     → Bob.heldAmount -= 5000       │
      │                            │  6. Alice.balance -= 5500          │
      │                            │     Alice.heldAmount += 5500       │
      │                            │  7. Create bid (WINNING, 5500)     │
      │                            │  8. auction.currentPrice = 5500    │
      │                            │  ◄─────── tx committed ───────     │
      │                            │                                    │
      │  HTTP 201 { bid }          │                                    │
      │◄──────────────────────────│                                    │
      │                            │                                    │
      │                            │ io.to('auction:xyz').emit(         │
      │                            │   'bid:new', { bid }               │
      │                            │ )                                  │
      │                            │──────────────────────────────────►│
      │                            │                     WebSocket push │
      │                            │                    (Bob & Charlie  │
      │                            │                     see new bid)   │
      │                            │                                    │
      │                            │ processAutoBids('xyz', Alice, 5500)│
      │                            │  → Charlie has auto-bid max=6000   │
      │                            │  → Charlie bids 5600               │
      │                            │  → io.emit('bid:new', charlie_bid) │
      │                            │──────────────────────────────────►│
      │                            │                                    │
      │  WebSocket: bid:new        │                                    │
      │  (Charlie's auto-bid)      │                                    │
      │◄──────────────────────────│                                    │
```

---

## 16. API Reference

### Auth
| Method | Endpoint             | Auth | Description              |
| ------ | -------------------- | ---- | ------------------------ |
| POST   | `/api/auth/register` | ❌    | Register new account     |
| POST   | `/api/auth/login`    | ❌    | Login, get JWT           |
| GET    | `/api/auth/me`       | ✅    | Get current user details |

### Users
| Method | Endpoint                 | Auth | Description           |
| ------ | ------------------------ | ---- | --------------------- |
| GET    | `/api/users/me`          | ✅    | My profile            |
| PUT    | `/api/users/me`          | ✅    | Update name/avatar    |
| GET    | `/api/users/me/bids`     | ✅    | My bid history        |
| GET    | `/api/users/me/auctions` | ✅    | My listed auctions    |
| GET    | `/api/users/me/won`      | ✅    | Auctions I won        |
| POST   | `/api/users/rate`        | ✅    | Rate another user     |
| GET    | `/api/users/:id`         | ✅    | View any user profile |

### Auctions
| Method | Endpoint                    | Auth | Description                            |
| ------ | --------------------------- | ---- | -------------------------------------- |
| GET    | `/api/auctions`             | ❌    | List auctions (filter/search/paginate) |
| GET    | `/api/auctions/:id`         | ❌    | Single auction details                 |
| POST   | `/api/auctions`             | ✅    | Create auction                         |
| PUT    | `/api/auctions/:id`         | ✅    | Edit (pending only)                    |
| DELETE | `/api/auctions/:id`         | ✅    | Cancel auction                         |
| POST   | `/api/auctions/:id/buy-now` | ✅    | Instant purchase                       |

### Bidding
| Method | Endpoint                          | Auth | Description             |
| ------ | --------------------------------- | ---- | ----------------------- |
| POST   | `/api/bids/auctions/:id`          | ✅    | Place a bid             |
| GET    | `/api/bids/auctions/:id`          | ✅    | List bids for auction   |
| GET    | `/api/bids/auctions/:id/auto-bid` | ✅    | My auto-bid for auction |
| POST   | `/api/bids/auctions/:id/auto-bid` | ✅    | Set/update auto-bid     |
| DELETE | `/api/bids/auctions/:id/auto-bid` | ✅    | Cancel auto-bid         |

### Wallet
| Method | Endpoint                   | Auth | Description                          |
| ------ | -------------------------- | ---- | ------------------------------------ |
| GET    | `/api/wallet`              | ✅    | Wallet balance + recent transactions |
| POST   | `/api/wallet/deposit`      | ✅    | Add fake money                       |
| POST   | `/api/wallet/withdraw`     | ✅    | Withdraw available balance           |
| GET    | `/api/wallet/transactions` | ✅    | Transaction history                  |

### Notifications
| Method | Endpoint                      | Auth | Description         |
| ------ | ----------------------------- | ---- | ------------------- |
| GET    | `/api/notifications`          | ✅    | List notifications  |
| PUT    | `/api/notifications/read-all` | ✅    | Mark all as read    |
| PUT    | `/api/notifications/:id/read` | ✅    | Mark one as read    |
| DELETE | `/api/notifications/:id`      | ✅    | Delete notification |

### Watchlist
| Method | Endpoint                    | Auth | Description              |
| ------ | --------------------------- | ---- | ------------------------ |
| GET    | `/api/watchlist`            | ✅    | My watchlist             |
| POST   | `/api/watchlist`            | ✅    | Add auction to watchlist |
| DELETE | `/api/watchlist/:auctionId` | ✅    | Remove from watchlist    |

### Admin
| Method | Endpoint                           | Auth    | Description        |
| ------ | ---------------------------------- | ------- | ------------------ |
| GET    | `/api/admin/dashboard`             | 🔐 Admin | Stats overview     |
| GET    | `/api/admin/users`                 | 🔐 Admin | All users          |
| PUT    | `/api/admin/users/:userId/suspend` | 🔐 Admin | Suspend/unsuspend  |
| GET    | `/api/admin/auctions`              | 🔐 Admin | All auctions       |
| PUT    | `/api/admin/auctions/:id/moderate` | 🔐 Admin | Cancel or activate |
| GET    | `/api/admin/fraud-flags`           | 🔐 Admin | Suspicious bidders |

### Payments
| Method | Endpoint                             | Auth | Description             |
| ------ | ------------------------------------ | ---- | ----------------------- |
| POST   | `/api/payments/auctions/:id/confirm` | ✅    | Winner confirms payment |

---

## 17. How to Run

### Prerequisites
- Node.js 18+
- PostgreSQL (running locally or Docker)
- Redis (running locally or Docker)

### Quick Start with Docker (Recommended)

```bash
# Start Postgres and Redis
docker run -d --name pg -e POSTGRES_PASSWORD=password -p 5432:5432 postgres
docker run -d --name redis -p 6379:6379 redis
```

### Setup Steps

```bash
# 1. Install dependencies
cd back
npm install

# 2. Copy environment file
cp .env.example .env
# Edit .env and set your DATABASE_URL if different

# 3. Generate Prisma client
npx prisma generate

# 4. Create DB tables
npx prisma migrate dev --name init

# 5. Seed with test data
npm run prisma:seed

# 6. Start development server
npm run dev
```

Server runs at: `http://localhost:5000`

Health check: `GET http://localhost:5000/health`

### Test Accounts

| Email                 | Password    | Role                 |
| --------------------- | ----------- | -------------------- |
| admin@auctionhaus.com | admin123    | ADMIN                |
| alice@example.com     | password123 | USER (balance: 5000) |
| bob@example.com       | password123 | USER (balance: 3000) |
| charlie@example.com   | password123 | USER (balance: 8000) |

### Quick Test Flow

```bash
# 1. Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}'

# Copy the token from response

# 2. View active auctions
curl http://localhost:5000/api/auctions?status=ACTIVE

# 3. Place a bid (use auction ID from step 2)
curl -X POST http://localhost:5000/api/bids/auctions/<AUCTION_ID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5100}'
```

---

> **Summary:** AuctionHaus is a full-featured auction backend with real-time WebSocket bidding, three auction types (English/Dutch/Sealed), a server-side auto-bid engine using priority queue logic, an escrow-style wallet system, and scheduled background jobs for auction lifecycle management. The codebase follows a standard MVC pattern (routes → controllers → services) with Prisma for type-safe DB access and Zod for runtime validation.
