# Chapter 5 — High-Level Design and Architecture

## The Bird's Eye View

AuctionHaus has four main runtime components:

```
┌────────────────────────────────────────────────────────────┐
│  Browser (Next.js frontend)                                │
│  React 19 + TanStack Query + Zustand + Socket.io-client    │
└───────────────────┬────────────────────────────────────────┘
                    │ HTTP + WebSocket
┌───────────────────▼────────────────────────────────────────┐
│  Node.js Server (Express + Socket.io)                      │
│  REST API + Real-time gateway + BullMQ workers             │
└─────┬─────────────┬──────────────────────────────────┬─────┘
      │             │                                  │
      │ SQL         │ Redis protocol                   │ Redis protocol
┌─────▼─────┐ ┌─────▼───────────────────────────────┐ │
│ PostgreSQL │ │ Redis 7                              │ │
│ (Prisma)  │ │  - BullMQ job queues                 │ │
└───────────┘ │  - Socket.io pub/sub adapter         │ │
              │  - user:invalidate pub/sub channel   │ │
              │  - bid stream (auction:{id}:bids)    │ │
              └─────────────────────────────────────┘ │
                                                       │
         (same Redis, separate connections)────────────┘
```

All four run on the same machine for the demo. In a production deployment, each would run on a separate host — Node.js on Railway (or similar), Postgres on Supabase (or Railway's managed Postgres), Redis on Upstash (or Railway).

---

## The Node.js Server: One Process, Many Roles

The single Node.js process wears four hats simultaneously:

1. **HTTP server** — answers REST API calls from the frontend
2. **WebSocket server** — Socket.io peers with the frontend for real-time events
3. **BullMQ workers** — three workers (auctionWorker, dutchWorker, autoBidWorker, notificationWorker) consume jobs from Redis queues
4. **FraudEngine** — the in-process fraud detection module checks every bid as it arrives

These four things share one process, one Prisma client, and one Redis connection pool. This is a deliberate simplification for a college demo. In a production system, the workers might run as separate processes or containers to allow independent scaling.

---

## Request Lifecycle

Here is what happens when a browser makes a request, step by step:

```
Browser sends: POST /api/bids/auctions/abc123
               Body: { amount: 5000 }
               Header: Authorization: Bearer <JWT>

Step 1: Express receives the HTTP request

Step 2: Middleware chain runs in order:
  - helmet() sets security headers (X-Content-Type-Options, etc.)
  - cors() adds CORS headers (allows front/ origin)
  - morgan() logs the request to stdout
  - express.json() parses the JSON body
  - rateLimiter() checks request count from this IP
  - authenticate() middleware validates the JWT:
      - decodes the token (if invalid, throws 401)
      - checks the user cache (Map<userId, {user, expiresAt}>)
      - if not cached or expired, queries prisma.user.findUnique
      - if user is suspended, throws 403
      - attaches req.user = { id, email, role }

Step 3: Route handler runs:
  - bid.routes.ts matches POST /auctions/:id
  - Calls bid.controller.placeBid(req, res)

Step 4: Controller calls service:
  - bid.controller validates req.body with Zod
  - Calls bid.service.placeBid({ auctionId, bidderId, amount })

Step 5: Service runs business logic:
  - Opens prisma.$transaction(async tx => { ... })
  - Locks the auction row: SELECT * FROM auctions WHERE id=? FOR UPDATE
  - Validates: is auction ACTIVE? is amount >= currentPrice + minIncrement?
  - Locks wallets in ascending userId order: SELECT * FROM wallets WHERE userId IN (?) FOR UPDATE
  - Updates: auction.currentPrice, old winner bid status, new bid insert, wallet holds
  - Checks anti-sniping: if endTime - now < antiSnipingMins, extend endTime
  - After tx commits:
      - Enqueues auto-bid job: autoBidQueue.add('process-ladder', { auctionId })
      - Calls notifyUser (enqueues notification job)
      - Calls FraudEngine.observe(bidEvent) (fire-and-forget)

Step 6: Controller emits socket event:
  - io.to(`auction:${auctionId}`).emit('bid:new', { bid, auctionId, serverTs })

Step 7: HTTP response:
  - 201 Created with the bid object

Step 8: Socket.io delivers to all connected watchers of that auction
```

This is the critical path for the most important operation in the system: placing a bid. Every step is deliberate.

---

## The Real-Time Flow

Socket.io events flow in two directions:

### Client → Server

```
Client emits: auction:join  { auctionId }
Server: socket.join(`auction:${auctionId}`)
        records presence: presenceMap[auctionId]++
        emits auction:presence { auctionId, viewers: count } to room

Client emits: auction:leave { auctionId }
Server: socket.leave(`auction:${auctionId}`)
        decrements presence, emits update

Client emits: auction:sync  { auctionId }
Server: fetches current auction state, emits it back to the socket
```

### Server → Client

```
bid:new         → { bid, auctionId, serverTs }
                   sent to room auction:{id}
                   (amount/bidderId nulled for sealed auctions)

bid:ladder      → { auctionId, steps[], finalPrice, lastBidId, serverTs }
                   sent to room auction:{id} after auto-bid resolution

auction:extended → { auctionId, newEndTime }
                   sent to room auction:{id} on anti-snipe trigger

auction:price-drop → { auctionId, currentPrice }
                   sent to room auction:{id} on Dutch price drop

auction:started → { auctionId }
                   broadcast to all

auction:ended   → { auctionId, winnerId, finalPrice }
                   sent to room auction:{id}

auction:presence → { auctionId, viewers }
                   sent to room auction:{id} on join/leave

notification:new → { notification }
                   sent to room user:{id}

fraud:flag      → { flag, features, score, reason }
                   sent to room admin:fraud
```

---

## The Background Job Flow

BullMQ has four active queues:

### auction-scheduler queue

Two job types:
- `start-auction`: scheduled with `delay = startTime - now`. When it fires, sets auction status to ACTIVE, starts the Dutch price-drop job if applicable, notifies watchlist users.
- `end-auction`: scheduled with `delay = endTime - now`. When it fires, calls `endAuction()`.

### dutch-auction queue

One job type: `drop-price`. Created with `repeat: { every: dutchInterval * 1000 }`. Fires every N seconds, drops the price by `dutchPriceStep`, checks for auto-bid matches, calls `placeBid` if a match is found.

### auto-bid queue

One job type: `process-ladder`. Enqueued by `bid.service.placeBid` after the manual bid transaction commits. Consumed by `autoBidWorker`, which runs the ladder in one transaction.

### notifications queue

One job type: `deliver`. Enqueued by every call to `notifyUser()`. Consumed by `notificationWorker`, which writes the notification to the database and emits it over Socket.io.

---

## The Fraud Detection Flow

The fraud engine runs entirely in-process:

```
bid.service.placeBid commits transaction
    ↓
fire-and-forget: FraudEngine.observe(bidEvent)
    ↓
FraudEngine updates BidGraph (sliding 30-min window)
    ↓
extractFeatures(bidEvent, graph) → FeatureVector
    ↓
classifier.score(features) → probability [0,1]
    ↓
if score > THRESHOLD (0.5):
    io.to('admin:fraud').emit('fraud:flag', { ... })
    prisma.fraudFlag.create({ ... })  -- fire-and-forget
```

The entire path after transaction commit is fire-and-forget. The bid is committed to the database regardless of fraud score. The fraud engine observes, scores, and flags asynchronously. This keeps the bid latency clean — fraud checking adds zero milliseconds to the user's wait time.

---

## Horizontal Scaling

The system is designed to support horizontal scaling (multiple server instances), though only one instance runs in the demo.

**What enables multi-instance:**

1. **Socket.io Redis adapter** — `io.adapter(createAdapter(redisPub, redisSub))`. When one instance emits `bid:new` to a room, the Redis adapter fans the message out to all instances, and each delivers it to the sockets connected to that instance.

2. **User cache invalidation via pub/sub** — When an admin suspends a user, the suspension is published to the `user:invalidate` Redis channel. All instances subscribe and clear the user from their in-memory caches.

3. **BullMQ workers** — BullMQ uses Redis for state. Multiple instances can run workers; Redis ensures each job is processed exactly once.

4. **Stateless auth** — JWTs carry all needed information. No session store.

**What still needs work for true multi-instance:**

- The in-memory BidGraph (fraud engine) is not shared across instances. Two instances would build independent graphs from different subsets of bids. In production, the graph would need to be in a shared store (Redis or an in-memory DB like Drizzle's upcoming streaming tables).
- The LatencyRing (fraud engine metrics) is per-process.

---

## Security Boundaries

The security model has three layers:

**Layer 1: Authentication** — Every authenticated route requires a valid JWT. The JWT is verified with HMAC-SHA256. Expired tokens are rejected. Suspended users are rejected.

**Layer 2: Authorisation** — Admin routes require `role === ADMIN`. User routes check that the resource belongs to `req.user.id` (e.g., you can only see your own wallet).

**Layer 3: Input Validation** — Every request body is validated with Zod. An invalid schema returns 400 before the controller even runs.

**Rate limiting** — General routes: 200 requests per 15 minutes. Auth routes (login, register): 10 per 15 minutes (to prevent brute-force password attacks).

---

## The Monorepo's Module Map

Here is every backend module and its responsibility:

```
back/src/
  index.ts                    entry point: Express + Socket.io bootstrap
  lib/
    prisma.ts                 Prisma client singleton
    redis.ts                  4 Redis connections + bootstrap
    decimal.ts                D(), toNum(), serializeMoney()
  gateway/
    socket.gateway.ts         room auth, join/leave/sync, presence
  middleware/
    auth.middleware.ts        JWT verify + user cache
    error.middleware.ts       AppError + Zod error handler
    rateLimiter.middleware.ts 200/15min general, 10/15min strict
  modules/
    auth/                     register, login, /me
    users/                    profile, bidHistory, rateUser
    auctions/                 CRUD, buyNow, cancel, FTS search
    bidding/                  placeBid, getAuctionBids, BidSequencer
    auto-bid/                 setAutoBid, cancelAutoBid, getMyAutoBid
    wallet/                   deposit, withdraw
    payments/                 confirmWinnerPayment
    escrow/                   settleWithinTx (idempotent settlement)
    notifications/            notifyUser (enqueues to BullMQ)
    watchlist/                add, remove, list
    ratings/                  rateUser
    admin/                    stats, suspend, moderate, fraud flags
    fraud/                    BidGraph, extractFeatures, classifier, FraudEngine
    commitments/              commitBid, revealBid, getCommitments
  queues/
    auction.queue.ts          auctionQueue, dutchAuctionQueue, autoBidQueue, notificationQueue
  workers/
    index.ts                  auctionWorker, dutchWorker, autoBidWorker, notificationWorker
  scripts/
    seed-users.ts             creates demo users
    seed-demo.ts              idempotent full demo seed
    generate-docs.ts          generates docs/api.md + docs/schema.md
    create-*.ts               convenience auction creators
```

---

## Next Chapter

Chapter 6 goes inside every one of those modules — what each service does, how it is structured, and what the notable implementation choices are.
