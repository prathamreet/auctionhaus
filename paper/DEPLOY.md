# AuctionHaus — Deployment Guide

> Phase D: deploy for the demo / viva. Two approaches depending on timeline.

---

## Option A — Single-machine demo (recommended for viva)

Run everything locally. No cloud account needed.

```bash
# 1. Prerequisites
#    Docker Desktop running
#    Node.js 20 LTS
#    pnpm / npm

# 2. Start Postgres + Redis
docker compose up -d

# 3. Migrate DB
cd back && npx prisma migrate dev

# 4. Start backend
npm run dev      # listens on :5000

# 5. Start frontend (new terminal)
cd front && npm run dev  # listens on :3000

# 6. Run simulator (new terminal) — triggers live fraud flags in the admin UI
cd back && npm run sim:run

# 7. Open /admin/fraud in the browser — watch fraud:flag events arrive live
```

`docker-compose.yml` (at repo root):
```yaml
version: "3.9"
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ah
      POSTGRES_PASSWORD: ah
      POSTGRES_DB: auctionhaus
    ports: ["5432:5432"]
    volumes: [pg_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pg_data:
```

`.env` for `back/`:
```
DATABASE_URL=postgresql://ah:ah@localhost:5432/auctionhaus
REDIS_URL=redis://localhost:6379
JWT_SECRET=supersecretkey_change_in_prod
PORT=5000
FRONTEND_URL=http://localhost:3000
```

---

## Option B — Cloud deploy (Railway + Vercel)

### Backend → Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and init project
railway login
railway init   # creates a new Railway project

# Set env vars in Railway dashboard:
#   DATABASE_URL  — Railway Postgres plugin
#   REDIS_URL     — Railway Redis plugin
#   JWT_SECRET    — generate: openssl rand -hex 32
#   FRONTEND_URL  — https://your-vercel-app.vercel.app
#   NODE_ENV      — production

# Deploy
cd back && railway up
```

Run migration after deploy:
```bash
railway run npx prisma migrate deploy
```

### Frontend → Vercel

```bash
npm install -g vercel

cd front
vercel

# Set env vars in Vercel dashboard:
#   NEXT_PUBLIC_API_URL  — https://your-railway-backend.railway.app/api
#   NEXT_PUBLIC_WS_URL   — https://your-railway-backend.railway.app
```

### After split (Phase D repo-split)

```
auctionhaus-back/    ← back/ contents, deployed to Railway
auctionhaus-front/   ← front/ contents, deployed to Vercel
auctionhaus-meta/    ← plan.md, paper/, docs/, xdocs/  (not deployed)
```

Migration from monorepo:
```bash
# From repo root
git subtree split --prefix=back -b back-branch
git subtree split --prefix=front -b front-branch

# Create new repos and push
cd /tmp && mkdir auctionhaus-back && cd auctionhaus-back
git init && git pull /path/to/monorepo back-branch
git remote add origin git@github.com:you/auctionhaus-back.git
git push -u origin main
```

---

## Demo script (3-minute screencast)

**Goal:** Show the "just CRUD" critique is wrong.

```
00:00  Landing page — explain the three auction types
00:20  Create an English auction (₹10,000 starting, 5-min, ₹500 increment)
00:45  Open /auctions from another browser tab as a different user
01:00  Place a bid → price-time chart updates in real time
01:15  Open a third tab, set auto-bid max ₹15,000
        → auto-bid ladder fires: bid log shows every ₹500 increment (not a jump)
01:40  Open /admin/fraud in the admin tab
        → run npm run sim:run in a terminal
        → fraud:flag events arrive in the live feed with scores, feature bars
02:10  Click a flag → show FeatureBar highlighting sellerCoOccurrence (shill pattern)
        → Suspend the bidder, show them blocked on next bid attempt
02:35  Open a sealed-bid auction → show CommitmentPanel
        → commit a bid (only hash sent to server)
        → after auction ends → reveal → highest commitment wins
02:55  Summary: real-time fraud detection, atomic escrow, Redis throughput bench
```

---

## Compile the paper

```bash
cd paper
pdflatex main.tex
bibtex main
pdflatex main.tex   # twice for references to resolve
pdflatex main.tex

# Output: main.pdf
```

For Overleaf: zip the paper/ directory and upload. Set compiler to pdfLaTeX.

Required LaTeX packages (TeX Live):
- IEEEtran, cite, amsmath, graphicx, booktabs, pgfplots, hyperref, tikzposter
