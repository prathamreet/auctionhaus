# Backend Service Layer

> 50 nodes · cohesion 0.07

## Key Concepts

- **createError()** (36 connections) — `back/src/middleware/error.middleware.ts`
- **error.middleware.ts** (15 connections) — `back/src/middleware/error.middleware.ts`
- **auction.controller.ts** (13 connections) — `back/src/modules/auctions/auction.controller.ts`
- **auction.service.ts** (12 connections) — `back/src/modules/auctions/auction.service.ts`
- **admin.service.ts** (10 connections) — `back/src/modules/admin/admin.service.ts`
- **user.service.ts** (10 connections) — `back/src/modules/users/user.service.ts`
- **auth.service.ts** (8 connections) — `back/src/modules/auth/auth.service.ts`
- **payment.service.ts** (8 connections) — `back/src/modules/payments/payment.service.ts`
- **wallet.service.ts** (8 connections) — `back/src/modules/wallet/wallet.service.ts`
- **watchlist.service.ts** (7 connections) — `back/src/modules/watchlist/watchlist.service.ts`
- **generateToken()** (3 connections) — `back/src/modules/auth/auth.service.ts`
- **login()** (3 connections) — `back/src/modules/auth/auth.service.ts`
- **register()** (3 connections) — `back/src/modules/auth/auth.service.ts`
- **moderateAuction()** (2 connections) — `back/src/modules/admin/admin.service.ts`
- **suspendUser()** (2 connections) — `back/src/modules/admin/admin.service.ts`
- **createAuction()** (2 connections) — `back/src/modules/auctions/auction.controller.ts`
- **buyNow()** (2 connections) — `back/src/modules/auctions/auction.service.ts`
- **cancelAuction()** (2 connections) — `back/src/modules/auctions/auction.service.ts`
- **createAuction()** (2 connections) — `back/src/modules/auctions/auction.service.ts`
- **getAuctionById()** (2 connections) — `back/src/modules/auctions/auction.service.ts`
- **updateAuction()** (2 connections) — `back/src/modules/auctions/auction.service.ts`
- **getMe()** (2 connections) — `back/src/modules/auth/auth.service.ts`
- **errorHandler()** (2 connections) — `back/src/middleware/error.middleware.ts`
- **confirmWinnerPayment()** (2 connections) — `back/src/modules/payments/payment.service.ts`
- **getUserProfile()** (2 connections) — `back/src/modules/users/user.service.ts`
- *... and 25 more nodes in this community*

## Relationships

- [[Auto-Bid & Queue Engine]] (14 shared connections)
- [[Admin & API Controllers]] (10 shared connections)
- [[Prisma Client & Scripts]] (7 shared connections)
- [[User Profile Controllers]] (1 shared connections)

## Source Files

- `back/src/middleware/error.middleware.ts`
- `back/src/modules/admin/admin.service.ts`
- `back/src/modules/auctions/auction.controller.ts`
- `back/src/modules/auctions/auction.service.ts`
- `back/src/modules/auth/auth.service.ts`
- `back/src/modules/payments/payment.service.ts`
- `back/src/modules/users/user.service.ts`
- `back/src/modules/wallet/wallet.service.ts`
- `back/src/modules/watchlist/watchlist.service.ts`

## Audit Trail

- EXTRACTED: 192 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*