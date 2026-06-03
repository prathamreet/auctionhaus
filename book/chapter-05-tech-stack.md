# Chapter 3 — The Technology Stack

## The Monorepo Structure

AuctionHaus is a TypeScript monorepo managed with npm workspaces. This means one repository, one `node_modules` at the root, and multiple packages sharing dependencies. The packages are:

```
auctionhaus/
  back/          — the Express + Socket.io backend
  front/         — the Next.js frontend
  packages/
    simulator/   — the synthetic bidder simulator (for research)
  paper/         — LaTeX research papers
  book/          — this book
```

Why a monorepo? Because the frontend and backend share types conceptually (though not literally via imports yet). Having them in one repo means one git history, one pull request for a full feature, and one place to look for everything. The plan is to split them into separate repos before a production deployment, but for a college project, the monorepo keeps things simple.

---

## The Backend Stack

### Node.js + TypeScript

Node.js runs the backend. TypeScript adds a static type system on top of JavaScript. In a project with complex domain models — wallets, bids, escrow, fraud scores — types prevent an entire class of bugs: calling `bid.amount + 100` when `amount` is a Prisma `Decimal` object, not a plain number. TypeScript would flag this at compile time, not at runtime when a user's balance goes wrong.

The `tsconfig` targets ES2020 with `strict: true`, which enables all strict type checks. Every `any` cast in the codebase is a conscious choice, not an accident.

### Express 4

Express is the HTTP framework. It is not the newest framework (Fastify is faster, Hono is leaner) but it is the one with the largest ecosystem and the one most students and hiring managers recognise. The middleware model — `app.use(fn)` — is simple, composable, and easy to test.

The middleware order in AuctionHaus is deliberate and important:

```
helmet()         → sets security headers (XSS protection, HSTS, etc.)
cors()           → allows the frontend origin
morgan()         → logs every HTTP request
express.json()   → parses JSON request bodies
rateLimiter      → throttles requests (200/15min general, 10/15min strict for auth routes)
routes           → all the actual route handlers
errorHandler     → catches any error thrown in route handlers
```

Helmet must come before routes so its headers are always set. The error handler must be last because Express identifies it by its four-argument signature `(err, req, res, next)`.

### Prisma 5 + PostgreSQL 15

Prisma is the ORM (Object-Relational Mapper). It translates TypeScript code into SQL and maps the results back to TypeScript objects. The schema lives in `back/prisma/schema.prisma` and drives three things:

1. The SQL migrations (Prisma generates the SQL that creates and modifies tables)
2. The TypeScript types for every model (Prisma generates client types)
3. The query API (e.g., `prisma.auction.findMany({ where: { status: 'ACTIVE' } })`)

**Why PostgreSQL instead of MongoDB?** Several reasons:

- Money requires ACID transactions. Postgres has excellent transaction support; MongoDB's multi-document transactions are historically weaker and harder to reason about.
- The data is relational. Users have wallets, auctions have bids, bids belong to users and auctions. A graph of relations is exactly what relational databases are designed for.
- Full-text search. Postgres has a built-in GIN index on `tsvector` expressions, which powers the auction catalogue search. MongoDB's text search is less mature.
- `SELECT FOR UPDATE`. Pessimistic row locking — the key to our race condition fixes — is a core Postgres feature. MongoDB does not have per-document pessimistic locks.

**The Decimal problem:** Postgres has a `NUMERIC(precision, scale)` type that stores exact decimal values. We use `NUMERIC(18, 2)` for all money fields — up to 16 digits before the decimal point, exactly 2 after. Prisma maps this to its `Decimal` type in TypeScript. The `back/src/lib/decimal.ts` helper provides convenience functions `D()` (construct), `toNum()` (serialize to number for the API response), and arithmetic wrappers.

### Socket.io 4

Socket.io provides bidirectional real-time communication between the backend and frontend. It runs on top of WebSockets but falls back to HTTP long-polling if WebSockets are not available (rare in modern browsers but useful for corporate firewalls).

Socket.io organises clients into **rooms**. AuctionHaus uses two room namespaces:
- `auction:{id}` — everyone watching a specific auction
- `user:{id}` — notifications for a specific user
- `admin:fraud` — the admin fraud dashboard feed

When a bid is placed, the backend emits `bid:new` to the `auction:{id}` room. Every browser tab watching that auction page receives the event and updates the price display, the bid history, the chart — all without a page refresh.

**Why Socket.io instead of Server-Sent Events (SSE)?** SSE is simpler and perfectly adequate for one-way server-to-client pushes (like notifications). But AuctionHaus also needs client-to-server events: `auction:join` and `auction:leave` for room management, and `auction:sync` for reconnection. Socket.io handles bidirectional communication cleanly. SSE would require a separate HTTP endpoint for the client-to-server direction.

### BullMQ 5 + Redis

BullMQ is a job queue library built on Redis. AuctionHaus uses it for three purposes:

1. **Delayed jobs**: "Start this auction at 9 AM tomorrow." BullMQ stores the job with a delay and executes it when the time comes.
2. **Recurring jobs**: "Drop the price of this Dutch auction every 30 seconds." BullMQ supports `repeat: { every: ms }` jobs.
3. **Background processing**: Notifications are not written to the database inline (which would slow down the bid placement). Instead, a job is enqueued and the notification worker handles it asynchronously.

The auto-bid ladder is also processed by a BullMQ worker, which is the key architectural decision that made the ladder atomic (Chapter 9).

### Redis (4 connections)

Redis serves multiple roles in AuctionHaus:

1. **BullMQ backend** — job queue state lives in Redis
2. **Socket.io adapter** — the Redis adapter fans out socket events to multiple server instances (horizontal scaling)
3. **Pub/Sub channel** — the `user:invalidate` channel broadcasts suspend events so all instances clear their user cache simultaneously
4. **Bid Stream** (optional) — `auction:{id}:bids` Redis Streams, used by the bid sequencer for high-throughput scenarios

Redis was chosen over alternatives like RabbitMQ or Kafka because:
- BullMQ requires Redis specifically (it uses Redis data structures like sorted sets for job scheduling)
- Redis is lightweight enough to run on a local laptop during development
- Socket.io's Redis adapter is mature and well-documented
- Redis Streams (for the sequencer) are a native Redis 5.0+ feature, no separate service needed

---

## The Frontend Stack

### Next.js 16 with App Router

Next.js 16 uses the "App Router" introduced in Next.js 13 and stabilised in subsequent releases. This is different from the older "Pages Router." The key differences:

- **Server Components by default**: Components can run on the server and never ship any JavaScript to the browser unless they are marked `'use client'`. This reduces bundle size.
- **File-based routing**: The folder structure under `app/` defines the URL structure.
- **Layouts**: A `layout.tsx` file wraps all pages under a path, allowing shared navigation and providers without re-rendering on navigation.

AuctionHaus uses App Router for all pages. All socket-related components and pages with interactivity are `'use client'` components.

### React 19

React 19 brings improvements to concurrent rendering and transitions. AuctionHaus uses standard React hooks (`useState`, `useEffect`, `useRef`, `useCallback`, `useContext`). The hydration-safe Zustand auth store pattern (explained below) is the most React-specific detail worth knowing.

### TanStack Query 5 (React Query)

TanStack Query manages server state — data that comes from the API. It handles:
- Caching (so the same auction is not fetched twice in 30 seconds)
- Loading states
- Error states
- Refetching (manual or on-focus)

The key pattern in AuctionHaus is: socket events trigger query invalidations. When `bid:new` arrives over Socket.io, `queryClient.invalidateQueries(['auction-bids', auctionId])` forces a refetch. This keeps the data fresh without the complexity of manually merging socket payloads into client state.

### Zustand 5

Zustand manages client state — data that is local to the browser, not from the server. In AuctionHaus, the auth store holds `{ user, token, isHydrated }`. The `isHydrated` flag is critical: Zustand reads from localStorage, which is browser-only. During server-side rendering, localStorage doesn't exist. Without `isHydrated`, the page would flash between "logged out" (server render) and "logged in" (after hydration). The auth store gates its rendering on `isHydrated` being true.

### Tailwind CSS v4 (Used Minimally)

Tailwind v4 is installed but used very lightly. Most styles come from CSS custom properties (variables) defined in `globals.css`. The design system chapter (Chapter 14) explains this in detail, but the short version is: the codebase uses CSS variables for all colours and spacing, then applies them via plain CSS class names. No `className="flex items-center gap-4 text-sm font-medium"` sprawl.

### Zod

Zod is a TypeScript-first schema validation library. The backend uses it for request body validation in controllers. The frontend mirrors the same schemas in `lib/contracts.ts` so that form validation uses the same rules as server validation. There is no `packages/contracts` package yet (that is a future improvement), but the logic is duplicated correctly.

---

## The Simulator Package

`packages/simulator/` is a standalone TypeScript package that creates synthetic auction events for training and evaluating the fraud detector. It is not part of the running application — it is a research tool.

It has:
- Agent classes (TruthfulAgent, SniperAgent, ShillAgent, CollusionAgent)
- A run script that creates auctions via the live API and drives agents against them
- A dataset module that replays the logged events for training and evaluation
- A training script that fits the logistic regression classifier
- An evaluation script that measures precision, recall, F1, and ROC on the held-out test set

This is explained in full in Chapter 12.

---

## Why Not...?

Every tech choice is a tradeoff. Here are the alternatives we considered and why we did not use them:

| What we use | Alternative | Why we didn't |
|------------|-------------|---------------|
| Express | Fastify / Hono | Less ecosystem support; Express is what most students know |
| PostgreSQL | MongoDB | MongoDB's transactions are weaker; no `SELECT FOR UPDATE` |
| Prisma | TypeORM / Drizzle | Prisma has the best DX for schema-first development |
| BullMQ | Bull / RabbitMQ / Kafka | BullMQ is the Redis-native successor to Bull; Kafka is overkill |
| Socket.io | SSE / ws | Socket.io has rooms, namespaces, and the Redis adapter built in |
| Next.js | Remix / Vite+React | Next.js has the most students and employers already familiar with it |
| TanStack Query | SWR / Jotai | TanStack Query v5 has the best devtools and cache invalidation API |
| Zustand | Redux / Recoil | Zustand is the simplest auth store with the fewest boilerplate |
| Logistic Regression | XGBoost / neural net | LR is interpretable, fast, and sufficient for the feature set |
| SHA-256 commitments | Pedersen + Bulletproofs | Pedersen requires ZK proof library; SHA-256 is built into Node |

---

## Next Chapter

Chapter 4 goes deep into the database schema — every model, every field, every relationship, every index. This is the foundation that all the code sits on.
