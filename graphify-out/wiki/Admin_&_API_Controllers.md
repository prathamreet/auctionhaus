# Admin & API Controllers

> 63 nodes · cohesion 0.05

## Key Concepts

- **index.ts** (27 connections) — `back/src/index.ts`
- **auth.middleware.ts** (24 connections) — `back/src/middleware/auth.middleware.ts`
- **authenticate()** (11 connections) — `back/src/middleware/auth.middleware.ts`
- **AuthRequest** (11 connections) — `back/src/middleware/auth.middleware.ts`
- **admin.controller.ts** (10 connections) — `back/src/modules/admin/admin.controller.ts`
- **auth.controller.ts** (9 connections) — `back/src/modules/auth/auth.controller.ts`
- **auto-bid.controller.ts** (8 connections) — `back/src/modules/auto-bid/auto-bid.controller.ts`
- **wallet.controller.ts** (8 connections) — `back/src/modules/wallet/wallet.controller.ts`
- **auth.routes.ts** (7 connections) — `back/src/modules/auth/auth.routes.ts`
- **watchlist.controller.ts** (7 connections) — `back/src/modules/watchlist/watchlist.controller.ts`
- **admin.routes.ts** (6 connections) — `back/src/modules/admin/admin.routes.ts`
- **bid.routes.ts** (6 connections) — `back/src/modules/bidding/bid.routes.ts`
- **auction.routes.ts** (5 connections) — `back/src/modules/auctions/auction.routes.ts`
- **notification.routes.ts** (5 connections) — `back/src/modules/notifications/notification.routes.ts`
- **payment.controller.ts** (5 connections) — `back/src/modules/payments/payment.controller.ts`
- **payment.routes.ts** (5 connections) — `back/src/modules/payments/payment.routes.ts`
- **user.routes.ts** (5 connections) — `back/src/modules/users/user.routes.ts`
- **wallet.routes.ts** (5 connections) — `back/src/modules/wallet/wallet.routes.ts`
- **watchlist.routes.ts** (5 connections) — `back/src/modules/watchlist/watchlist.routes.ts`
- **rateLimiter.middleware.ts** (4 connections) — `back/src/middleware/rateLimiter.middleware.ts`
- **auto-bid.routes.ts** (4 connections) — `back/src/modules/auto-bid/auto-bid.routes.ts`
- **initSocketGateway()** (3 connections) — `back/src/gateway/socket.gateway.ts`
- **bootstrap()** (3 connections) — `back/src/index.ts`
- **initWorkers()** (3 connections) — `back/src/workers/index.ts`
- **socket.gateway.ts** (2 connections) — `back/src/gateway/socket.gateway.ts`
- *... and 38 more nodes in this community*

## Relationships

- [[Auto-Bid & Queue Engine]] (11 shared connections)
- [[Backend Service Layer]] (10 shared connections)
- [[Notification Controllers]] (3 shared connections)
- [[User Profile Controllers]] (3 shared connections)
- [[Prisma Client & Scripts]] (2 shared connections)

## Source Files

- `back/src/gateway/socket.gateway.ts`
- `back/src/index.ts`
- `back/src/middleware/auth.middleware.ts`
- `back/src/middleware/rateLimiter.middleware.ts`
- `back/src/modules/admin/admin.controller.ts`
- `back/src/modules/admin/admin.routes.ts`
- `back/src/modules/auctions/auction.routes.ts`
- `back/src/modules/auth/auth.controller.ts`
- `back/src/modules/auth/auth.routes.ts`
- `back/src/modules/auto-bid/auto-bid.controller.ts`
- `back/src/modules/auto-bid/auto-bid.routes.ts`
- `back/src/modules/bidding/bid.routes.ts`
- `back/src/modules/notifications/notification.routes.ts`
- `back/src/modules/payments/payment.controller.ts`
- `back/src/modules/payments/payment.routes.ts`
- `back/src/modules/users/user.routes.ts`
- `back/src/modules/wallet/wallet.controller.ts`
- `back/src/modules/wallet/wallet.routes.ts`
- `back/src/modules/watchlist/watchlist.controller.ts`
- `back/src/modules/watchlist/watchlist.routes.ts`

## Audit Trail

- EXTRACTED: 229 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*