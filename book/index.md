# AuctionHaus — The Complete Book

> Written for future students, collaborators, and anyone who wants to understand this project from zero to research paper. If you read this book end to end you will be able to explain every architectural decision, every bug we fixed, every algorithm we invented, and every paper we wrote — in your own words, to anyone.

---

## How to Read

Read the chapters in order for the first time. After that, use the table below to jump to any topic. Every chapter is written plain-English first, then gets technical. No prior knowledge of auction systems is assumed.

---

## Table of Contents

### Part 1 — The Story

| # | File | What It Covers |
|---|------|----------------|
| 1 | [chapter-01-origin-story.md](chapter-01-origin-story.md) | The "just CRUD" verdict; what the audit found; why we decided to make this research-worthy |
| 2 | [chapter-02-the-doc-reality-gap.md](chapter-02-the-doc-reality-gap.md) | The 12 features documented as "done" that did not exist in the code; the cautionary tale of aspirational documentation |
| 3 | [chapter-03-product-and-features.md](chapter-03-product-and-features.md) | What AuctionHaus IS as a product — three auction types, wallet, auto-bid, sealed bid, fraud dashboard, full user journey |
| 4 | [chapter-04-auction-lifecycles.md](chapter-04-auction-lifecycles.md) | End-to-end lifecycle for English, Dutch, and Sealed-Bid auctions including every edge case and the state machine |

### Part 2 — The Foundation

| # | File | What It Covers |
|---|------|----------------|
| 5 | [chapter-05-tech-stack.md](chapter-05-tech-stack.md) | Every technology choice and the reason behind it: Express, Postgres, Redis, BullMQ, Socket.io, Next.js, Zod, Prisma |
| 6 | [chapter-06-database-schema.md](chapter-06-database-schema.md) | Complete Prisma schema: 11 models, 9 enums, every field and index, the Decimal money migration, all migrations |
| 7 | [chapter-07-money-trace.md](chapter-07-money-trace.md) | The schema in action — follow ₹50,000 through every database write from deposit to settlement |
| 8 | [chapter-08-hld-architecture.md](chapter-08-hld-architecture.md) | System topology, the full request lifecycle, real-time flow, background job flow, fraud detection flow, security model |

### Part 3 — The Code

| # | File | What It Covers |
|---|------|----------------|
| 9 | [chapter-09-error-handling-and-security.md](chapter-09-error-handling-and-security.md) | All 11 middleware layers in order, AppError and createError, Zod error formatting, rate limiting, Helmet, JWT, CORS |
| 10 | [chapter-10-lld-modules.md](chapter-10-lld-modules.md) | Every backend module: auth, auctions, bidding, auto-bid, wallet, escrow, fraud, commitments, admin — what each owns and does |
| 11 | [chapter-11-concurrency-money.md](chapter-11-concurrency-money.md) | Floating-point bugs, five race conditions, SELECT FOR UPDATE, the global lock-ordering policy, idempotent settlement |
| 12 | [chapter-12-realtime-layer.md](chapter-12-realtime-layer.md) | Socket.io rooms and events, presence counter with debounce, Redis adapter, reconnect-aware hooks, ConnectionStatus |
| 13 | [chapter-13-auto-bid-engine.md](chapter-13-auto-bid-engine.md) | The atomic ladder protocol: three implementation options, the algorithm, bounding argument, Phase E enhancements |
| 14 | [chapter-14-redis-and-jobs.md](chapter-14-redis-and-jobs.md) | Four Redis connections, BullMQ queues and workers, Redis Streams, backpressure detection, pub/sub cache invalidation |
| 15 | [chapter-15-frontend.md](chapter-15-frontend.md) | Next.js App Router, 13-primitive design system, dark mode, BidChart SVG, Phase F live bidding UI, isHydrated pattern |

### Part 4 — The Research

| # | File | What It Covers |
|---|------|----------------|
| 16 | [chapter-16-literature-review.md](chapter-16-literature-review.md) | Every cited paper in plain English: Vickrey, Roth-Ockenfels, Trevathan, Ford, Tsang, NetProbe, Kleppmann, Brandt |
| 17 | [chapter-17-fraud-detection.md](chapter-17-fraud-detection.md) | What shill bidding is, why retrospective detection fails, the bid graph, five features (τ φ ρ σ γ), logistic regression |
| 18 | [chapter-18-simulator-eval.md](chapter-18-simulator-eval.md) | Four agent personas, multi-auction corpus, FNV-1a deterministic split, training pipeline, ablation, the honest rebuild |
| 19 | [chapter-19-cryptographic-commitments.md](chapter-19-cryptographic-commitments.md) | SHA-256 commit-reveal: hiding + binding, the original privacy bug, the protocol step-by-step, Pedersen future work |
| 20 | [chapter-20-testing-and-benchmarks.md](chapter-20-testing-and-benchmarks.md) | Jest unit tests, mocked Prisma, k6 load tests, the 28.5× throughput story, the LatencyRing |
| 21 | [chapter-21-research-papers.md](chapter-21-research-papers.md) | Both IEEE papers dissected section-by-section, the provisional patent, every reference explained |

### Part 5 — The Journey and Reference

| # | File | What It Covers |
|---|------|----------------|
| 22 | [chapter-22-the-phases.md](chapter-22-the-phases.md) | Complete dev story: Phase A through RP-2 — every decision, mistake, and lesson |
| 23 | [chapter-23-niche-implementation-details.md](chapter-23-niche-implementation-details.md) | isDecimalLike duck-type, neg() helper, $queryRaw FOR UPDATE, FNV-1a internals, Dutch repeat jobId, serverTs, phantom notification |
| 24 | [chapter-24-deployment-and-ops.md](chapter-24-deployment-and-ops.md) | Local dev, Docker Compose, Railway + Vercel, demo seeder, research pipeline commands, 3-minute demo script |
| 25 | [chapter-25-future-work.md](chapter-25-future-work.md) | Pedersen + Bulletproofs, online SGD, distributed streams, RL auto-bid agent, TLA+ formal verification |
| 26 | [chapter-26-viva-defense.md](chapter-26-viva-defense.md) | Scripted 60-second answers to every examiner question; the 30-second elevator pitch — test yourself after reading the book |

---

## Part Abstracts

**Part 1 — The Story** explains why this project exists. Chapter 1 sets up the "just CRUD" problem. Chapter 2 is the honest audit: a table of 12 features that docs claimed existed but did not. Chapter 3 explains the product as a user experiences it. Chapter 4 goes deep into each auction type end-to-end — because you need to understand the product thoroughly before you can understand the code that implements it.

**Part 2 — The Foundation** builds the mental model before the code. Chapter 5 justifies every technology choice. Chapter 6 explains every database model and index. Chapter 7 is the most concrete chapter in the book: a single ₹50,000 bid traced through every database write from deposit to final settlement. Chapter 8 shows how all the pieces connect at the architecture level.

**Part 3 — The Code** covers every major subsystem. Chapter 9 comes first because the error handling and middleware stack is used by every module that follows. Chapter 10 covers every backend module. Chapters 11–14 cover the four hardest parts: concurrency, real-time, auto-bid, Redis. Chapter 15 covers the frontend.

**Part 4 — The Research** starts with the literature review (chapter 16) so you have academic context before reading about our approach. Chapters 17–18 cover the fraud engine and evaluation. Chapter 19 covers cryptographic commitments. Chapters 20–21 cover testing, benchmarks, and both papers.

**Part 5 — The Journey and Reference** starts with the complete chronological development story (chapter 22), then goes into the subtle code details that do not fit anywhere else (chapter 23), then practical deployment (chapter 24), future work (chapter 25), and ends with the viva defense guide (chapter 26) — the capstone chapter to test everything you learned.

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Redis Stream vs FOR UPDATE at 100 VUs | **28.5× throughput improvement** |
| Fraud detection overhead per bid | **< 1ms** (p99) |
| Fraud F1 on held-out test (threshold 0.5) | **0.933** |
| Ablation: drop σ (seller co-occurrence) | F1 falls from 0.933 to 0.842 |
| Money precision | **NUMERIC(18,2)** — exact fixed-point |
| Database models | **11** |
| Auth cache TTL | 30 seconds |
| Ladder bound | (maxMax − startPrice) / minIncrement + 2 |
| Presence debounce | 250 ms |
| Stream backpressure threshold | 750 entries |

---

## Quick Command Reference

```bash
# Start the stack
docker compose up -d
cd back && npx prisma migrate dev && npm run db:seed-demo

# Research pipeline
npm run sim:run          # generate labelled corpus
npm run train:fraud      # fit classifier on train partition
npm run eval:fraud       # evaluate on held-out test + write paper figures

# Compile the paper
cd paper
pdflatex main.tex && bibtex main && pdflatex main.tex

# Load test
cd back/packages/simulator/k6
k6 run bid-throughput.js -e BACKEND_URL=http://localhost:3001 -e JWT=... -e AUCTION_ID=...
```

---

## Authors

Asha Joseph · Pratham Reet · Nitin A. Rane · Reeshav Sinha · Om Ji Rao

Department of Computer Science and Engineering  
New Horizon College of Engineering, Bengaluru, India
