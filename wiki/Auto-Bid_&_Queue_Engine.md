# Auto-Bid & Queue Engine

> 35 nodes · cohesion 0.09

## Key Concepts

- **notification.service.ts** (15 connections) — `back/src/modules/notifications/notification.service.ts`
- **index.ts** (14 connections) — `back/src/workers/index.ts`
- **auto-bid.service.ts** (13 connections) — `back/src/modules/auto-bid/auto-bid.service.ts`
- **bid.service.ts** (12 connections) — `back/src/modules/bidding/bid.service.ts`
- **redis.ts** (9 connections) — `back/src/lib/redis.ts`
- **bid.controller.ts** (8 connections) — `back/src/modules/bidding/bid.controller.ts`
- **auction.queue.ts** (8 connections) — `back/src/queues/auction.queue.ts`
- **notifyUser()** (7 connections) — `back/src/modules/notifications/notification.service.ts`
- **processAutoBids()** (5 connections) — `back/src/modules/auto-bid/auto-bid.service.ts`
- **io** (5 connections) — `back/src/index.ts`
- **bullMQConnection** (3 connections) — `back/src/lib/redis.ts`
- **setAutoBid()** (2 connections) — `back/src/modules/auto-bid/auto-bid.service.ts`
- **placeBid()** (2 connections) — `back/src/modules/bidding/bid.controller.ts`
- **getAuctionBids()** (2 connections) — `back/src/modules/bidding/bid.service.ts`
- **placeBid()** (2 connections) — `back/src/modules/bidding/bid.service.ts`
- **redis** (2 connections) — `back/src/lib/redis.ts`
- **deleteNotification()** (2 connections) — `back/src/modules/notifications/notification.service.ts`
- **markRead()** (2 connections) — `back/src/modules/notifications/notification.service.ts`
- **auctionQueue** (2 connections) — `back/src/queues/auction.queue.ts`
- **dutchAuctionQueue** (2 connections) — `back/src/queues/auction.queue.ts`
- **endAuction()** (2 connections) — `back/src/workers/index.ts`
- **cancelAutoBid()** (1 connections) — `back/src/modules/auto-bid/auto-bid.service.ts`
- **getMyAutoBid()** (1 connections) — `back/src/modules/auto-bid/auto-bid.service.ts`
- **getAuctionBids()** (1 connections) — `back/src/modules/bidding/bid.controller.ts`
- **handleRedisError()** (1 connections) — `back/src/lib/redis.ts`
- *... and 10 more nodes in this community*

## Relationships

- [[Backend Service Layer]] (14 shared connections)
- [[Admin & API Controllers]] (11 shared connections)
- [[Prisma Client & Scripts]] (4 shared connections)
- [[Notification Controllers]] (1 shared connections)
- [[Frontend Pages & UI]] (1 shared connections)

## Source Files

- `back/src/index.ts`
- `back/src/lib/redis.ts`
- `back/src/modules/auto-bid/auto-bid.service.ts`
- `back/src/modules/bidding/bid.controller.ts`
- `back/src/modules/bidding/bid.service.ts`
- `back/src/modules/notifications/notification.service.ts`
- `back/src/queues/auction.queue.ts`
- `back/src/workers/index.ts`

## Audit Trail

- EXTRACTED: 132 (99%)
- INFERRED: 1 (1%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*