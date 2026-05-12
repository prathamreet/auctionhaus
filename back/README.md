## Project Structure

```bash
back/
├── prisma/
│   └── schema.prisma          # All DB models
├── src/
│   ├── index.ts               # Entry point (Express + Socket.io + BullMQ)
│   ├── lib/
│   │   ├── prisma.ts          # Singleton Prisma client
│   │   └── redis.ts           # Redis + BullMQ connection options
│   ├── middleware/
│   │   ├── auth.middleware.ts # JWT + admin guard
│   │   ├── error.middleware.ts
│   │   └── rateLimiter.middleware.ts
│   ├── gateway/
│   │   └── socket.gateway.ts  # Socket.io (auction rooms + user rooms)
│   ├── queues/
│   │   └── auction.queue.ts   # BullMQ queues (scheduler, dutch, notifications)
│   ├── workers/
│   │   └── index.ts           # BullMQ workers (start/end auctions, Dutch price drops)
│   ├── prisma/
│   │   └── seed.ts            # DB seed with test accounts + sample auctions
│   └── modules/
│       ├── auth/              # Register, login, JWT, /me
│       ├── users/             # Profile, bid history, ratings
│       ├── auctions/          # CRUD, buy-now, all 3 auction types
│       ├── bidding/           # Core bidding engine (English/Dutch/Sealed)
│       ├── auto-bid/          # Auto-bid priority queue engine
│       ├── wallet/            # Mock deposit/withdraw, transactions
│       ├── notifications/     # DB + real-time push via sockets
│       ├── watchlist/         # Add/remove/list
│       ├── admin/             # Dashboard, user suspend, fraud flags
│       └── payments/          # Mock winner payment settlement
```

## to run

```bash
Setup DB — update DATABASE_URL in .env
Run migration: npx prisma migrate dev --name init
Seed data: npm run prisma:seed
Start dev: npm run dev → http://localhost:5000
```


# ah-back
