# Chapter 19 — Deployment and Operations

## Overview

AuctionHaus can be run in three ways:

1. **Local development** — PostgreSQL + Redis on Docker, Node.js + Next.js directly (or via `npm run dev`)
2. **Docker Compose** — the full stack (Postgres + Redis + backend + frontend) in containers
3. **Cloud deployment** — Railway (backend) + Vercel (frontend), with managed Postgres and Redis

This chapter covers all three and includes the demo seeder and the 3-minute demo script.

---

## Environment Variables

### Backend (`back/.env`)

```env
DATABASE_URL="postgresql://ah:ah@localhost:5432/auctionhaus"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="change-this-in-production"
PORT=3001
FRONTEND_URL="http://localhost:3000"
BID_SEQUENCER=false          # set to true to use Redis Stream sequencer
BID_STREAM_BACKPRESSURE=750  # stream length before 503 backpressure
```

### Frontend (`front/.env.local`)

```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_WS_URL="http://localhost:3001"
```

---

## Local Development Setup

### Step 1: Start Infrastructure

```bash
# Start PostgreSQL 15 and Redis 7 via Docker
docker run --name ah-postgres -e POSTGRES_USER=ah -e POSTGRES_PASSWORD=ah \
  -e POSTGRES_DB=auctionhaus -p 5432:5432 -d postgres:15

docker run --name ah-redis -p 6379:6379 -d redis:7
```

Or use the Docker Compose file (next section).

### Step 2: Install Dependencies

```bash
npm install   # from repo root — installs all workspaces
```

### Step 3: Database Setup

```bash
cd back
npx prisma migrate dev    # applies all migrations, regenerates Prisma client
npm run db:seed-users     # creates 5 demo accounts
# OR
npm run db:seed-demo      # idempotent full demo (users + 3 live auctions)
```

### Step 4: Run Backend

```bash
cd back
npm run dev    # starts Express + Socket.io + BullMQ workers on :3001
```

### Step 5: Run Frontend

```bash
cd front
npm run dev    # starts Next.js dev server on :3000
```

### Step 6: Verify

Open `http://localhost:3000`. You should see the landing page. Login with one of the demo accounts (password: `123123`):
- `alice@demo.com` — bidder
- `bob@demo.com` — bidder
- `charlie@demo.com` — bidder
- `seller@demo.com` — seller/bidder
- `hoster@x.com` — seller (creates demo auctions)
- `admin@demo.com` — administrator

---

## Docker Compose Setup

The `docker-compose.yml` at the repo root runs the full stack:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: ah
      POSTGRES_PASSWORD: ah
      POSTGRES_DB: auctionhaus
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ah -d auctionhaus"]
      interval: 5s
      retries: 10

  redis:
    image: redis:7
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

  backend:
    build: ./back
    ports: ["3001:3001"]
    environment:
      DATABASE_URL: postgresql://ah:ah@postgres:5432/auctionhaus
      REDIS_URL: redis://redis:6379
      JWT_SECRET: dev-secret
      FRONTEND_URL: http://localhost:3000
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }

  frontend:
    build: ./front
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXT_PUBLIC_WS_URL: http://localhost:3001
    depends_on:
      - backend
```

```bash
docker compose up -d
# Wait for all services to be healthy
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run db:seed-demo
```

---

## Cloud Deployment

### Option A: Railway + Vercel

**Backend on Railway:**

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# Create project and deploy backend
cd back
railway init
railway add --database postgres
railway add --service redis
railway up

# Set environment variables in Railway dashboard:
# DATABASE_URL (Railway auto-sets from the Postgres service)
# REDIS_URL (Railway auto-sets from the Redis service)
# JWT_SECRET = <your secret>
# FRONTEND_URL = https://your-app.vercel.app
```

**Frontend on Vercel:**

```bash
cd front
vercel
# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_API_URL = https://your-backend.railway.app
# NEXT_PUBLIC_WS_URL = https://your-backend.railway.app
```

### Repo Split for Deployment

For clean deployment, the plan recommends splitting into two repos:

```bash
# Backend repo
git subtree split --prefix back -b back-only
git push origin back-only:main

# Frontend repo  
git subtree split --prefix front -b front-only
git push origin front-only:main
```

---

## The Demo Seeder

`back/src/scripts/seed-demo.ts` creates a complete, ready-to-demo environment in one command:

```bash
npm run db:seed-demo
```

What it creates:
- 6 user accounts (password: `123123` for all)
- `hoster@x.com` has a fully funded wallet
- One ACTIVE English auction: "Vintage Rolex" — starts ₹50,000, minIncrement ₹500, 2h duration
- One ACTIVE Dutch auction: "MacBook Pro" — starts ₹80,000, drops ₹2,000 every 5 min
- One ACTIVE Sealed-Bid auction: "Rare Coin" — ends in 1 hour

The seeder is **idempotent**: running it twice does not create duplicate data. It checks for existing accounts/auctions before creating new ones.

---

## Running the Research Pipeline

To regenerate the paper's data from scratch:

```bash
# Step 1: Start the backend (user does this)
cd back
npm run dev

# Step 2: Run the simulator (creates multi-auction corpus)
npm run sim:run        # runs ~60 seconds, creates events.jsonl + manifest.json

# Step 3: Train the classifier
npm run train:fraud    # reads all runs, fits LR, writes fraud.classifier.ts

# Step 4: Evaluate on held-out test set
npm run eval:fraud     # writes roc_data.json, ablation_data.json, metrics.tex

# Step 5: Compile the paper
cd paper
pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex
```

The full pipeline takes about 5 minutes plus the time to start the backend.

---

## The 3-Minute Demo Script

From `paper/DEPLOY.md`:

### Minute 1: The Platform

```
Tab 1: Landing page (localhost:3000)
- Point to "three auction formats" — English, Dutch, Sealed
- Navigate to /auctions — show the catalogue
- Click the active English auction — show the live bid chart, the countdown
```

### Minute 1:30: Place a Bid

```
Tab 1 (logged in as alice@demo.com):
- Place a bid on the English auction
- Watch: bid:new arrives via Socket.io, chart updates, price counter jumps
- Set auto-bid limit: ₹70,000

Tab 2 (logged in as bob@demo.com):
- Place a competing bid — watch alice's auto-bid ladder fire
- The LadderBanner appears: "Auto-bid ladder · N rungs resolved"
- The bid history shows the ladder steps with [A] icons
```

### Minute 2: The Fraud Dashboard

```
Tab 3 (logged in as admin@demo.com):
- Navigate to /admin/fraud
- Show the fraud:flag feed — should have entries from the simulator run
- Expand a flag: show the FeatureBar with sellerCoOccurrence highlighted
- Show the reason string: "4 auctions with same seller (co-occurrence)"
- Click "Suspend bidder" — show the success notification
```

### Minute 2:30: Sealed Bid + Commitments

```
Tab 1: Navigate to the sealed-bid auction
- Show: bid amounts are null, bidder names are null during active phase
- Click "Commit Bid" — enter amount, generate nonce, hash displayed
- Navigate to /admin/fraud — show that fraud flags are still generated
  for sealed bids (the engine sees the bid event, not the amount)
```

### Minute 3: Close

```
"What you just saw:
- Real-time fraud detection with sub-millisecond overhead per bid
- Atomic auto-bid ladder with per-increment logging
- Cryptographic sealed-bid commitments
- 28.5× throughput improvement via Redis Stream sequencer

The research paper is paper/main.tex — it compiles to a PDF with pdflatex."
```

---

## Troubleshooting

**"Cannot connect to Postgres"**
- Check `DATABASE_URL` in `back/.env`
- Verify Docker containers are running: `docker ps`
- Check container health: `docker logs ah-postgres`

**"Cannot connect to Redis"**
- Check `REDIS_URL` in `back/.env`
- Verify Redis is running: `docker exec ah-redis redis-cli ping`

**"JWT secret mismatch"**
- Frontend and backend must use the same `JWT_SECRET`
- After changing the secret, all existing tokens become invalid

**"prisma.settlement does not exist"**
- Run `npx prisma migrate dev` to apply pending migrations and regenerate the client

**"eval:fraud shows no examples"**
- Make sure you have run `npm run sim:run` at least once while the backend was running
- Check `back/packages/simulator/runs/` for run directories

---

## Next Chapter

Chapter 20 is the final chapter: future work. What we wished we could build but could not, and why each item is worth pursuing.
