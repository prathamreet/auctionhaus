# AuctionHaus — Complete System Documentation

> **Auto-generated system dump** — Raw technical reference for the entire codebase.
> Tech Stack: Next.js 15 (App Router) · Node/Express · PostgreSQL · Prisma · Socket.io · Zustand · React Query

---

## 1. What This Codebase Does

AuctionHaus is a **real-time auction platform** supporting three auction formats:
- **English** — Ascending price, highest bid wins at close. Anti-sniping extension. Optional Buy Now.
- **Dutch** — Descending price over time, first buyer at current price wins.
- **Sealed Bid** — Hidden bids revealed only after auction close, highest wins.

Core capabilities: live WebSocket bid updates, server-side auto-bidding engine, escrow-style wallet with hold/release, background cron scheduler for auction lifecycle, admin panel with fraud detection, user ratings.

---

## 2. Folder Structure

```
ah/
├── back/                          # Express API Server
│   ├── prisma/schema.prisma       # Database schema (10 models)
│   ├── scripts/db-hardening.ts    # CHECK constraints + GIN index
│   ├── src/
│   │   ├── index.ts               # Server entry — Express + Socket.io bootstrap
│   │   ├── gateway/
│   │   │   └── socket.gateway.ts  # WebSocket event handlers
│   │   ├── lib/
│   │   │   ├── prisma.ts          # Singleton + connectWithRetry + graceful shutdown
│   │   │   ├── decimal.ts         # Prisma Decimal → JS number converter
│   │   │   └── logger.ts          # Console logger + auditLog()
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts  # JWT verify + in-memory userCache + requireAdmin
│   │   │   └── error.middleware.ts # Zod/Prisma error handler + createError()
│   │   ├── modules/
│   │   │   ├── auth/              # register, login, me (bcrypt + JWT)
│   │   │   ├── auctions/          # CRUD, search, buy-now, cancel, Dutch timing
│   │   │   ├── bidding/           # placeBid (English/Dutch/Sealed), getBids
│   │   │   ├── auto-bid/          # processAutoBids iterative simulation
│   │   │   ├── wallet/            # deposit, withdraw (pessimistic lock), transactions
│   │   │   ├── notifications/     # create, list, markRead, delete (capped at 200)
│   │   │   ├── watchlist/         # add/remove/list (upsert)
│   │   │   ├── users/             # profile, bidHistory, myAuctions, wonAuctions, rateUser
│   │   │   ├── payments/          # confirmWinnerPayment, escrow.service.ts
│   │   │   └── admin/             # dashboard stats, user suspend, auction moderate, fraud
│   │   ├── prisma/                # seed.ts, seed.user.ts, seed.auction.ts, reset scripts
│   │   └── scheduler/
│   │       └── auction.scheduler.ts # Cron: start pending, end expired, Dutch drops
│   ├── jest.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── front/                         # Next.js 15 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx         # Root layout (Inter font, Providers wrapper)
│   │   │   ├── providers.tsx      # QueryClient + AuthProvider + Navbar
│   │   │   ├── globals.css        # Swiss design system (CSS variables)
│   │   │   ├── page.tsx           # Landing page (hero + auction type grid)
│   │   │   ├── login/page.tsx     # Split-panel login form
│   │   │   ├── register/page.tsx  # Split-panel register form
│   │   │   ├── auctions/
│   │   │   │   ├── page.tsx       # Catalogue grid + filters + pagination + watchlist
│   │   │   │   ├── [id]/page.tsx  # Detail: bid panel, history, countdown, auto-bid, rating
│   │   │   │   └── create/page.tsx# Create auction form (all 3 types)
│   │   │   ├── dashboard/page.tsx # User dashboard: stats, bids, listings, won
│   │   │   ├── wallet/page.tsx    # Balance, deposit/withdraw, transaction history
│   │   │   ├── watchlist/page.tsx # Watched auctions grid
│   │   │   ├── notifications/page.tsx # Notification list + mark read
│   │   │   ├── profile/page.tsx   # User profile + edit
│   │   │   ├── admin/page.tsx     # Admin: stats, users, auctions, fraud tabs
│   │   │   └── users/[id]/page.tsx# Public user profile
│   │   ├── middleware.ts          # Edge route protection (ah_logged_in cookie)
│   │   ├── store/authStore.ts     # Zustand: user/token + localStorage hydration
│   │   ├── lib/
│   │   │   ├── api.ts             # Axios instance + interceptors + parseApiError
│   │   │   └── socket.ts          # Socket.io client singleton + reconnect
│   │   └── components/
│   │       ├── AuthProvider.tsx    # Hydrate store + validate token on mount
│   │       └── Navbar.tsx         # Sticky nav + notification badge + socket listener
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── prd.md                         # Product requirements
├── checklist.md                   # Known issues tracker
└── docs/RAW_PROJECT_DUMP.md       # This file
```

---

## 3. Environment Variables

### Backend (`back/.env`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (Neon/Supabase format) |
| `JWT_SECRET` | HMAC secret for `jsonwebtoken` sign/verify |
| `REDIS_URL` | Redis connection (currently unused — reserved) |
| `FRONTEND_URL` | CORS origin whitelist (e.g. `http://localhost:3000`) |
| `PORT` | Server port (default `5000`) |

### Frontend (`front/.env.local`)
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Axios baseURL (e.g. `http://localhost:5000/api`) |
| `NEXT_PUBLIC_WS_URL` | Socket.io server URL (e.g. `http://localhost:5000`) |

---

## 4. Database Schema (Prisma)

**Provider:** PostgreSQL · **10 models** · Uses `@default(uuid())` for all IDs.

### Models & Key Fields

| Model | Key Fields | Notes |
|---|---|---|
| **User** | id, email (unique), password (bcrypt), name, role (USER/ADMIN), isSuspended, rating, ratingCount, avatar | 1:1 Wallet, 1:N Auctions/Bids/Notifications |
| **Wallet** | id, userId (unique), balance (Decimal), heldAmount (Decimal) | `heldAmount` = funds locked by active bids |
| **Transaction** | id, walletId, userId, type (DEPOSIT/WITHDRAWAL/BID_HOLD/BID_RELEASE/PAYMENT/REFUND), amount, status, referenceId, description | Full ledger trail |
| **Auction** | id, sellerId, title, description, imageUrl, type (ENGLISH/DUTCH/SEALED_BID), status (PENDING/ACTIVE/ENDED/CANCELLED), startingPrice, currentPrice, reservePrice, buyNowPrice, minIncrement, antiSnipingMins, dutchPriceStep, dutchInterval, autoAcceptAmount, winnerId, startTime, endTime | Core entity |
| **Bid** | id, auctionId, bidderId, amount (Decimal), status (ACTIVE/WINNING/OUTBID/WON/CANCELLED), isAutoBid | `SELECT FOR UPDATE` locking in placeBid |
| **AutoBid** | id, auctionId, userId, maxAmount, status (ACTIVE/EXHAUSTED/CANCELLED/OUTBID) | Iterative simulation engine |
| **WatchlistItem** | userId + auctionId (compound unique) | Upsert pattern |
| **Notification** | id, userId, type (enum: 12 types), title, message, data (Json), isRead | Capped at 200/user via raw SQL prune |
| **Rating** | raterId + rateeId + auctionId (compound unique), score (1-5), comment | Only winner↔seller pairs |

### Key Relations
- User 1:1 Wallet (cascade delete)
- User 1:N Auctions (as seller), Bids (as bidder), Notifications, Ratings
- Auction 1:N Bids, AutoBids, WatchlistItems
- Auction N:1 User (seller), User (winner — nullable)

### DB Hardening Script (`scripts/db-hardening.ts`)
- `CHECK (balance >= 0)` on wallets
- `CHECK (heldAmount >= 0)` on wallets
- Composite index: `bids(auctionId, status)`
- Composite index: `notifications(userId, isRead)`
- GIN full-text search index: `auctions(title || description)`

---

## 5. Authentication System

### Flow
1. **Register** → `POST /api/auth/register` → bcrypt hash (12 rounds) → create User + Wallet → sign JWT (7d) → return `{user, token}`
2. **Login** → `POST /api/auth/login` → bcrypt compare → sign JWT → return `{user, token}`
3. **Token Storage** → Frontend stores in `localStorage` (key: `token`) + sets `ah_logged_in=1` cookie for middleware
4. **Request Auth** → Axios interceptor attaches `Authorization: Bearer <token>` header
5. **Verify** → `authenticate` middleware decodes JWT → loads user from DB (cached 5min in `userCache` Map) → checks `isSuspended` → attaches `req.user`
6. **Admin Guard** → `requireAdmin` middleware checks `req.user.role === 'ADMIN'`

### Token Details
- Algorithm: HS256 (default jsonwebtoken)
- Expiry: 7 days
- Payload: `{ id, email, role }`

### In-Memory Auth Cache
```typescript
const userCache = new Map<string, { user: User; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```
- Reduces DB queries on every authenticated request
- Flushed on user suspension via `userCache.delete(userId)`

### Frontend Route Protection
- **Edge Middleware** (`middleware.ts`): Checks `ah_logged_in` cookie → redirects unauthenticated from protected routes, authenticated from auth pages
- **Client Guard**: AuthProvider validates token via `GET /api/auth/me` on mount

---

## 6. API Route Map

All routes prefixed with `/api`. Auth-required unless noted.

### Auth (`/api/auth`) — Public
| Method | Path | Handler | Auth |
|---|---|---|---|
| POST | `/register` | authController.register | No |
| POST | `/login` | authController.login | No |
| GET | `/me` | authController.me | Yes |

### Auctions (`/api/auctions`)
| Method | Path | Handler | Auth |
|---|---|---|---|
| GET | `/` | getAuctions | No (public listing) |
| GET | `/:id` | getAuction | No |
| POST | `/` | createAuction | Yes |
| PUT | `/:id` | updateAuction | Yes (seller only) |
| DELETE | `/:id` | cancelAuction | Yes (seller only) |
| POST | `/:id/buy-now` | buyNow | Yes |

### Bidding (`/api/bids`)
| Method | Path | Handler | Auth |
|---|---|---|---|
| POST | `/auctions/:auctionId` | placeBid | Yes |
| GET | `/auctions/:auctionId` | getBids | No |
| POST | `/auctions/:auctionId/auto-bid` | setAutoBid | Yes |
| GET | `/auctions/:auctionId/auto-bid` | getAutoBid | Yes |
| DELETE | `/auctions/:auctionId/auto-bid` | cancelAutoBid | Yes |

### Wallet (`/api/wallet`)
| Method | Path | Handler | Auth |
|---|---|---|---|
| GET | `/` | getWallet | Yes |
| POST | `/deposit` | deposit | Yes |
| POST | `/withdraw` | withdraw | Yes |
| GET | `/transactions` | getTransactions | Yes |

### Users (`/api/users`)
| Method | Path | Handler | Auth |
|---|---|---|---|
| GET | `/me` | getProfile (self) | Yes |
| PUT | `/me` | updateProfile | Yes |
| GET | `/me/bids` | getBidHistory | Yes |
| GET | `/me/auctions` | getMyAuctions | Yes |
| GET | `/me/won` | getWonAuctions | Yes |
| POST | `/rate` | rateUser | Yes |
| GET | `/:id` | getProfile (public) | Yes |

### Notifications (`/api/notifications`)
| Method | Path | Handler | Auth |
|---|---|---|---|
| GET | `/` | getNotifications | Yes |
| PUT | `/read-all` | markAllRead | Yes |
| PUT | `/:id/read` | markRead | Yes |
| DELETE | `/:id` | deleteNotification | Yes |

### Watchlist (`/api/watchlist`)
| Method | Path | Handler | Auth |
|---|---|---|---|
| GET | `/` | getWatchlist | Yes |
| POST | `/` | addToWatchlist | Yes |
| DELETE | `/:auctionId` | removeFromWatchlist | Yes |

### Payments (`/api/payments`)
| Method | Path | Handler | Auth |
|---|---|---|---|
| POST | `/auctions/:auctionId/confirm` | confirmPayment | Yes |

### Admin (`/api/admin`) — Admin only
| Method | Path | Handler |
|---|---|---|
| GET | `/dashboard` | getDashboard |
| GET | `/users` | getAllUsers (search, pagination) |
| PUT | `/users/:userId/suspend` | suspendUser |
| GET | `/auctions` | getAllAuctions (status filter) |
| PUT | `/auctions/:auctionId/moderate` | moderateAuction (cancel/activate) |
| GET | `/fraud-flags` | getFraudFlags |

---

## 7. Core Business Logic

### 7.1 Bidding Engine (`bid.service.ts`)

**placeBid** — The most critical function. Uses `SELECT FOR UPDATE` pessimistic locking.

```
1. Validate auction is ACTIVE
2. Validate bidder ≠ seller
3. Lock auction row: SELECT FOR UPDATE
4. Type-specific validation:
   - ENGLISH: bid >= currentPrice + minIncrement
   - DUTCH: bid >= currentPrice (instant win)
   - SEALED_BID: bid > startingPrice (hidden from others)
5. Wallet check: available balance >= bid amount
6. In transaction:
   a. Deduct from wallet balance, increment heldAmount
   b. Create BID_HOLD transaction record
   c. Mark previous WINNING bid as OUTBID
   d. Release previous bidder's held funds (increment balance, decrement heldAmount)
   e. Create BID_RELEASE transaction for previous bidder
   f. Create new bid with status WINNING
   g. Update auction.currentPrice
   h. Anti-sniping: if endTime < 5min away, extend by antiSnipingMins
7. Emit socket events: bid:new, auction:extended (if applicable)
8. Trigger processAutoBids() for competing auto-bids
```

### 7.2 Auto-Bid Engine (`auto-bid.service.ts`)

**processAutoBids** — Iterative simulation that runs after each manual bid.

```
1. Fetch all ACTIVE auto-bids for the auction (excluding current bidder)
2. Sort by maxAmount descending
3. For each auto-bid:
   a. Calculate next bid = currentPrice + minIncrement
   b. If nextBid > autoBid.maxAmount → mark EXHAUSTED, skip
   c. If wallet balance insufficient → mark EXHAUSTED, skip
   d. Call placeBid() internally
   e. Emit bid:new socket event
   f. Update currentPrice
   g. Check if competing auto-bids can counter → continue loop
4. Loop terminates when no auto-bid can outbid the current leader
```

### 7.3 Auction Scheduler (`auction.scheduler.ts`)

Runs via `node-cron` every 10 seconds (`*/10 * * * * *`).

**Three jobs per tick:**

1. **startPendingAuctions** — `WHERE status=PENDING AND startTime <= now`
   - Update to ACTIVE
   - Emit `auction:started` + `auction:state-sync`

2. **endExpiredAuctions** — `WHERE status=ACTIVE AND endTime <= now`
   - For each auction:
     - Find highest WINNING bid
     - If bid exists AND (no reserve OR bid >= reserve):
       - Set winner, mark bid WON, mark all others OUTBID
       - Call `EscrowService.settleAuction()` — auto-settles payment
     - If no valid winner: mark CANCELLED, refund all held amounts
   - Emit `auction:ended` + `auction:state-sync`

3. **processDutchPriceDrops** — `WHERE type=DUTCH AND status=ACTIVE`
   - Calculate elapsed intervals since startTime
   - Drop price by `dutchPriceStep * intervals`
   - Floor at `reservePrice` (if set)
   - Check auto-bids: if any auto-bid >= newPrice → instant buy
   - Check autoAcceptAmount threshold
   - Emit `auction:price-drop`

### 7.4 Escrow Service (`escrow.service.ts`)

**settleAuction** — Financial finalization, called by scheduler or buy-now.

```
1. Idempotency check: look for existing PAYMENT transaction
2. Calculate additionalLiquidNeeded = totalAmount - alreadyHeld
3. Deduct from winner: balance -= additionalLiquid, heldAmount -= held
4. Credit seller: balance += totalAmount
5. Record PAYMENT transactions for both parties
6. Record BID_RELEASE if held > 0
7. Audit log entry
8. Notify both parties via socket + DB notification
```

### 7.5 Wallet System (`wallet.service.ts`)

- **Deposit**: Simple `balance.increment` + DEPOSIT transaction record. Max 100,000/deposit.
- **Withdraw**: Uses `SELECT FOR UPDATE` pessimistic lock → checks available balance → `balance.decrement` + WITHDRAWAL transaction. Race-condition safe.
- **Available Balance**: `balance - heldAmount` (not a DB field, computed at read)

---

## 8. Real-Time System (Socket.io)

### Server Setup (`index.ts`)
- Socket.io attached to HTTP server
- CORS matches `FRONTEND_URL`
- Auth middleware: extracts JWT from `socket.handshake.auth.token`, verifies, attaches user

### Gateway Events (`socket.gateway.ts`)

**Client → Server:**
| Event | Payload | Action |
|---|---|---|
| `auction:join` | auctionId | Join room `auction:{id}` |
| `auction:leave` | auctionId | Leave room |

**Server → Client:**
| Event | Payload | Emitted By |
|---|---|---|
| `bid:new` | `{bid, currentPrice, auctionId}` | placeBid, processAutoBids |
| `auction:extended` | `{newEndTime, auctionId}` | Anti-sniping in placeBid |
| `auction:price-drop` | `{currentPrice, auctionId}` | Dutch scheduler |
| `auction:ended` | `{auctionId, winnerId}` | Scheduler |
| `auction:started` | `{auctionId}` | Scheduler |
| `auction:state-sync` | — | Scheduler (broadcast) |
| `notification:new` | `{id, type, title, message}` | notifyUser (to `user:{id}` room) |

### Client Usage
- Singleton pattern via `getSocket()` / `disconnectSocket()` / `reconnectSocket()`
- Auth token passed in `socket.handshake.auth`
- Reconnection: up to 10 attempts, 1-5s backoff
- Each page subscribes to relevant events and calls `qc.refetchQueries()`

---

## 9. Frontend Architecture

### State Management
- **Zustand** (`authStore.ts`): user, token, isHydrated. localStorage persistence with SSR-safe hydration.
- **React Query** (`@tanstack/react-query`): All server data. 30s default staleTime. Socket events trigger `refetchQueries()`.

### Auth Flow (Client)
1. `AuthProvider` mounts → calls `hydrate()` (reads localStorage)
2. If token exists → `GET /api/auth/me` to validate
3. On login/register → `setAuth()` saves to localStorage + cookie → `reconnectSocket()`
4. On logout → `logout()` clears localStorage + cookie → `disconnectSocket()`

### Key Pages

| Route | Component | Data Sources |
|---|---|---|
| `/` | Home (SSR) | Static |
| `/login` | LoginPage | POST /auth/login |
| `/register` | RegisterPage | POST /auth/register |
| `/auctions` | AuctionsPage | GET /auctions, GET /watchlist |
| `/auctions/[id]` | AuctionDetailPage | GET /auctions/:id, GET /bids, socket |
| `/auctions/create` | CreateAuctionPage | POST /auctions |
| `/dashboard` | DashboardPage | GET /users/me/bids, /auctions, /won |
| `/wallet` | WalletPage | GET /wallet, POST deposit/withdraw |
| `/watchlist` | WatchlistPage | GET /watchlist |
| `/notifications` | NotificationsPage | GET /notifications |
| `/profile` | ProfilePage | GET /users/me |
| `/admin` | AdminPage | GET /admin/* |
| `/users/[id]` | UserProfilePage | GET /users/:id |

### Design System (globals.css)
- **Philosophy**: Swiss/Brutalist — sharp borders, no border-radius, uppercase labels, Inter font
- **Palette**: `--accent: #c41e1e` (red), `--dutch: #1a6fa8` (blue), `--sealed: #6c3483` (purple)
- **Components**: `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.badge-*`, `.card`, `.price-tag`, `.timer-display`, `.auction-card`
- **Animations**: `ping` (live dot), `pulse-red` (urgent timer), `slideIn` (new bid rows)

---

## 10. Dependencies

### Backend
| Package | Purpose |
|---|---|
| express | HTTP framework |
| @prisma/client + prisma | ORM + migrations |
| socket.io | WebSocket server |
| jsonwebtoken | JWT sign/verify |
| bcryptjs | Password hashing |
| zod | Request validation |
| node-cron | Auction scheduler |
| helmet | Security headers |
| cors | Cross-origin config |
| express-rate-limit | Rate limiting (100 req/15min) |

### Frontend
| Package | Purpose |
|---|---|
| next (15.x) | React framework (App Router) |
| react (19.x) | UI library |
| @tanstack/react-query | Server state |
| zustand | Client state |
| axios | HTTP client |
| socket.io-client | WebSocket client |

---

## 11. Security Measures

| Layer | Mechanism |
|---|---|
| Passwords | bcrypt, 12 salt rounds |
| Auth | JWT HS256, 7-day expiry |
| Rate Limiting | 100 requests/15 minutes per IP |
| Headers | Helmet (CSP, HSTS, etc.) |
| CORS | Whitelisted `FRONTEND_URL` only |
| Input Validation | Zod schemas at controller layer |
| SQL Injection | Prisma parameterized queries |
| Financial Safety | `SELECT FOR UPDATE` pessimistic locking, DB CHECK constraints |
| Suspension | In-memory cache flush on suspend |
| Error Masking | Prisma/Postgres errors hidden in production |
| Idempotency | Escrow checks for duplicate PAYMENT transactions |

---

## 12. Test Accounts (from seed)

| Email | Password | Role |
|---|---|---|
| admin@x.com | admin123 | ADMIN |
| one@x.com | 123456 | USER |
| two@x.com | 123456 | USER |
| three@x.com | 123456 | USER |

All seeded with 1,000,000 wallet balance.

---

## 13. Known Issues (from checklist.md)

1. **Real-time bid sync lag**: Updates delayed 10-20s, requiring page refresh.
2. **Auto-bid history gap**: Simulation completes instantly without step-by-step display.
3. **Hydration mismatch risk**: Mitigated with `useState(() => Date.now())` pattern.
4. **Partial client-side validation**: Some bid validation still server-side only.

---

## 14. Data Flow: Bid Placement

```
User → POST /bids/auctions/:id
  → authenticate middleware (JWT)
  → Zod validation
  → bid.service.placeBid()
    → prisma.$transaction()
      → SELECT auction FOR UPDATE
      → Validate type, status, seller!=bidder, balance
      → wallet: balance -= amount, heldAmount += amount
      → Create BID_HOLD transaction
      → Outbid previous: OUTBID + release funds
      → Create new bid: WINNING
      → Update auction.currentPrice
      → Anti-sniping check
    → io.to(auction:id).emit('bid:new')
    → processAutoBids()
  → Response: { bid, auction }
```

## 15. Data Flow: Auction End

```
Cron tick (every 10s)
  → Query: ACTIVE auctions WHERE endTime <= now
  → For each:
    → Find highest WINNING bid
    → If valid winner:
      → Set auction.winnerId, status = ENDED
      → Mark bid WON, others OUTBID
      → EscrowService.settleAuction()
        → Deduct winner, credit seller
        → Record PAYMENT transactions
        → Notify both parties
    → If no winner: CANCEL + refund holds
    → io.emit('auction:ended', 'auction:state-sync')
```

---

*End of system dump.*
