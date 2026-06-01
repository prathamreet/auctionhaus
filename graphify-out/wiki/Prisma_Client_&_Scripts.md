# Prisma Client & Scripts

> 16 nodes · cohesion 0.12

## Key Concepts

- **prisma.ts** (21 connections) — `back/src/lib/prisma.ts`
- **add-custom-user.ts** (2 connections) — `back/src/scripts/add-custom-user.ts`
- **clear-auctions.ts** (2 connections) — `back/src/scripts/clear-auctions.ts`
- **clear-users.ts** (2 connections) — `back/src/scripts/clear-users.ts`
- **create-dutch-auction.ts** (2 connections) — `back/src/scripts/create-dutch-auction.ts`
- **create-english-auction.ts** (2 connections) — `back/src/scripts/create-english-auction.ts`
- **create-sealed-bid-auction.ts** (2 connections) — `back/src/scripts/create-sealed-bid-auction.ts`
- **seed-users.ts** (2 connections) — `back/src/scripts/seed-users.ts`
- **globalForPrisma** (1 connections) — `back/src/lib/prisma.ts`
- **main()** (1 connections) — `back/src/scripts/add-custom-user.ts`
- **main()** (1 connections) — `back/src/scripts/clear-auctions.ts`
- **main()** (1 connections) — `back/src/scripts/clear-users.ts`
- **main()** (1 connections) — `back/src/scripts/create-dutch-auction.ts`
- **main()** (1 connections) — `back/src/scripts/create-english-auction.ts`
- **main()** (1 connections) — `back/src/scripts/create-sealed-bid-auction.ts`
- **main()** (1 connections) — `back/src/scripts/seed-users.ts`

## Relationships

- [[Backend Service Layer]] (7 shared connections)
- [[Auto-Bid & Queue Engine]] (4 shared connections)
- [[Admin & API Controllers]] (2 shared connections)

## Source Files

- `back/src/lib/prisma.ts`
- `back/src/scripts/add-custom-user.ts`
- `back/src/scripts/clear-auctions.ts`
- `back/src/scripts/clear-users.ts`
- `back/src/scripts/create-dutch-auction.ts`
- `back/src/scripts/create-english-auction.ts`
- `back/src/scripts/create-sealed-bid-auction.ts`
- `back/src/scripts/seed-users.ts`

## Audit Trail

- EXTRACTED: 43 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*