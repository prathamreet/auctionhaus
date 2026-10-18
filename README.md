# AuctionHaus

Production-grade real-time distributed auction platform featuring serializable proxy bidding, an event-sourced stream sequencer, and graph-based streaming fraud detection.

---

## Overview

AuctionHaus is a high-concurrency auction platform engineered to bridge economic auction theory with ACID relational durability and distributed stream processing. The system implements three fundamental auction formats (English ascending, Dutch descending ticker, and Sealed-Bid blind tender) alongside an atomic ladder execution protocol for multi-agent proxy resolution and an in-memory sliding-window bipartite bid graph for sub-millisecond fraud scoring.

### Key Capabilities

* **Atomic Ladder Execution Protocol:** Resolves multi-agent proxy counter-bids within a single atomic database transaction. Guarantees 100% relational log fidelity, exact Vickrey second-price convergence (winning at the runner-up limit plus one increment), and mathematical deadlock freedom via a two-tier global lock hierarchy.
* **Dual Ingress Architecture:**
  * *Direct Mode (HTTP 201):* Synchronous PostgreSQL write-ahead log (WAL) persistence with row-level FOR UPDATE locking.
  * *Sequencer Mode (HTTP 202):* Low-latency write-behind ingestion via Redis Streams (XADD) with decoupled batch persistence workers, sustaining 975.0 bids/s at 8.1 ms p95 latency under high concurrency.
* **Streaming Fraud Detection Engine:** Maintains an active in-memory bipartite bid graph over a 30-minute sliding window to compute streaming behavioral features (response latency, frequency, increment ratio, seller co-occurrence, and bidding reciprocity) for real-time shill bidding detection.
* **Formal Escrow Accounting:** Two-phase financial ledger separating spendable balances from encumbered holds (heldAmount), eliminating double-deductions during bidding flurries and guaranteeing conservative settlement.
* **Real-Time Event Gateway:** Clustered WebSocket synchronization via Socket.io with Redis pub/sub adapter, providing sub-10ms state fan-out and multi-device UI synchronization.

---

## Architectural Highlights

### 1. Two-Tier Global Lock Hierarchy and Deadlock Freedom

To prevent circular wait-for deadlocks between concurrent manual bids, proxy ladder workers, buy-now requests, and settlement routines, AuctionHaus enforces a strict universal lock ordering:

```
[1. Acquire Auction Row Lock FOR UPDATE]
                   |
                   v
[2. Acquire Participant Wallets FOR UPDATE (Ascending userId Order)]
```

Because every concurrent writer acquires the auction lock first and sorts all candidate user IDs lexicographically prior to wallet locking, wait-for cycles are mathematically impossible (Gray and Reuter, 1992).

### 2. Dual Ingestion Performance Profile

Under load testing with Grafana k6 across 15-second constant-load sweeps on identical hardware (PostgreSQL 15, Redis 7):

| Implementation | Concurrency (VUs) | Total Requests | Accepted Bids | Throughput | p95 Latency | Operational Profile |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Direct Mode (Postgres)** | 1 VU | 53 | 53 | 3.5 bids/s | 236 ms | Synchronous WAL commit |
| **Sequencer Mode (Redis)** | 1 VU | 86 | 86 | 5.7 bids/s | 134 ms | In-memory stream enqueue |
| **Direct Mode (Postgres)** | 10 VUs | 143 | 143 | 9.5 bids/s | 1,284 ms | Queued lock manager waits |
| **Sequencer Mode (Redis)** | 10 VUs | 1,392 | 1,392 | 92.8 bids/s | 48 ms | Decoupled consumer drain |
| **Direct Mode (Postgres)** | 100 VUs | 570 | 450 | 30.0 bids/s | 5,772 ms | Connection pool saturation (120 timeouts) |
| **Sequencer Mode (Redis)** | 100 VUs | 14,626 | 14,626 | 975.0 bids/s | 8.1 ms | **32.5x throughput gain, 712x latency reduction** |

---

## Repository Structure

```
auctionhaus/
|-- back/                         # Express, Prisma ORM, BullMQ, Socket.io backend
|   |-- prisma/
|   |   |-- schema.prisma         # Relational database models (Auctions, Bids, Wallets, Escrow)
|   |   `-- migrations/           # Versioned PostgreSQL migrations
|   `-- src/
|       |-- gateway/              # Socket.io gateway and room dispatchers
|       |-- lib/                  # Decimal.js utilities, Redis client, Prisma singleton
|       |-- middleware/           # JWT auth, rate limiters, error handlers
|       |-- modules/
|       |   |-- auctions/         # Auction lifecycle, status transitions, buy-now
|       |   |-- bidding/          # Bid placement service and Redis Stream sequencer
|       |   |-- escrow/           # Idempotent settlement engine and holds
|       |   |-- fraud/            # In-memory bipartite graph and feature extractor
|       |   |-- notifications/    # Worker-driven notification service
|       |   `-- wallet/           # Ledger transactions and balance accounting
|       `-- workers/              # BullMQ workers (Atomic ladder, Dutch ticker, auction ends)
|-- front/                        # Next.js 16 (App Router), React 19, Tailwind CSS v4
|   `-- src/
|       |-- app/                  # Route layouts, pages (auctions, admin, profile, auth)
|       |-- components/           # UI components, live bid ladders, graphs
|       |-- hooks/                # Socket hooks, React Query hooks, auth stores
|       `-- lib/                  # Axios clients, formatters, type definitions
`-- packages/
    `-- simulator/                # Synthetic agent workload generator and k6 harnesses
        |-- k6/                   # k6 bid-throughput load test scripts
        `-- src/                  # Shill agent personas, training and evaluation pipelines
```

---

## Getting Started

### Prerequisites

* Node.js 20.x or higher
* npm 10.x or higher
* Docker and Docker Compose
* k6 (for load testing and benchmarks)

### 1. Infrastructure Setup

Launch PostgreSQL and Redis containers via Docker:

```bash
# PostgreSQL 16 (port 5432)
docker run --name auctionhaus-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=auctionhaus -p 5432:5432 -d postgres:16-alpine

# Redis 7 (port 6379)
docker run --name auctionhaus-redis -p 6379:6379 -d redis:7-alpine
```

Or start both services via Docker Compose:

```bash
docker compose up -d
```

### 2. Environment Configuration

Copy the example environment configurations:

```bash
# Backend environment
cp back/.env.example back/.env
```

Verify that `back/.env` contains your database connection string and Redis URL:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/auctionhaus?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your_jwt_secret_key"
FRONTEND_URL="http://localhost:3000"
```

### 3. Database Migration and Seeding

Install dependencies and synchronize the database schema:

```bash
# Install root, backend, frontend, and simulator dependencies
npm install

# Run Prisma schema migrations
npm run prisma:migrate

# Seed demo users and initial auction catalog
npm run db:seed
npm run db:seed-demo
```

### 4. Running Locally

Start the backend and frontend in separate terminals:

```bash
# Terminal 1: Backend service (Express + Socket.io + BullMQ workers)
npm run dev:back

# Terminal 2: Frontend web application (Next.js 16)
npm run dev:front
```

* Backend API: `http://localhost:5000`
* Frontend Application: `http://localhost:3000`

---

## Testing and Quality Assurance

Run the comprehensive test suite across backend services, workers, and concurrency models:

```bash
# Run backend Jest test suite (27 suites, 132 tests)
npm run test:back

# Run full project linting
npm run lint

# Compile and type-check backend and frontend
npm run build
```

---

## Benchmarks and Evaluation

### Load Testing the Atomic Ladder and Sequencer

To benchmark system throughput and latency under concurrent load:

```bash
# Prepare fresh auction state (resets price and tops up test wallets)
npm run db:prepare-bench

# Run the 15-second k6 benchmark sweep (Direct vs Stream mode)
npm run sim:ladder
```

Benchmark parameters can be customized using environment variables:

```bash
k6 run packages/simulator/k6/bid-throughput.js \
  -e SIM_TOKEN=<jwt_token> \
  -e AUCTION_ID=<auction_uuid> \
  -e VUS=100 \
  -e DURATION=15s \
  -e MODE=stream
```

### Fraud Detection Pipeline

Generate synthetic agent bidding traffic, extract graph features, and evaluate classifier precision/recall:

```bash
# Run synthetic agent bidding simulation
npm run sim:run

# Train fraud detection model on extracted graph features
npm run train:fraud

# Evaluate classifier against synthetic ground truth
npm run eval:fraud
```

---

## License

This project is licensed under the MIT License.
