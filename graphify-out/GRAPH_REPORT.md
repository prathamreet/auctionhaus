# Graph Report - auctionhaus  (2026-05-23)

## Corpus Check
- 123 files · ~52,745 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 682 nodes · 932 edges · 84 communities (59 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `68b06c11`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend Pages & UI|Frontend Pages & UI]]
- [[_COMMUNITY_Admin & API Controllers|Admin & API Controllers]]
- [[_COMMUNITY_Backend Service Layer|Backend Service Layer]]
- [[_COMMUNITY_Auto-Bid & Queue Engine|Auto-Bid & Queue Engine]]
- [[_COMMUNITY_Prisma Client & Scripts|Prisma Client & Scripts]]
- [[_COMMUNITY_Auction Create Form|Auction Create Form]]
- [[_COMMUNITY_Financial Integrity Core|Financial Integrity Core]]
- [[_COMMUNITY_User Profile Controllers|User Profile Controllers]]
- [[_COMMUNITY_Frontend Architecture|Frontend Architecture]]
- [[_COMMUNITY_Notification Controllers|Notification Controllers]]
- [[_COMMUNITY_App Layout & Providers|App Layout & Providers]]
- [[_COMMUNITY_Route Middleware|Route Middleware]]
- [[_COMMUNITY_Auction Scheduler & Dutch|Auction Scheduler & Dutch]]
- [[_COMMUNITY_Database Schema Design|Database Schema Design]]
- [[_COMMUNITY_Real-Time Socket Layer|Real-Time Socket Layer]]
- [[_COMMUNITY_Security & Middleware|Security & Middleware]]
- [[_COMMUNITY_API Routes & Catalogue|API Routes & Catalogue]]
- [[_COMMUNITY_Frontend ESLint Config|Frontend ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Landing Page|Landing Page]]
- [[_COMMUNITY_System Documentation|System Documentation]]
- [[_COMMUNITY_Auto-Bid Algorithm|Auto-Bid Algorithm]]
- [[_COMMUNITY_Backend Architecture|Backend Architecture]]
- [[_COMMUNITY_Design System Philosophy|Design System Philosophy]]
- [[_COMMUNITY_English Auction & Sniping|English Auction & Sniping]]
- [[_COMMUNITY_Auth System & JWT|Auth System & JWT]]
- [[_COMMUNITY_Backend ESLint|Backend ESLint]]
- [[_COMMUNITY_Next.js Types|Next.js Types]]
- [[_COMMUNITY_Project Root|Project Root]]
- [[_COMMUNITY_Tech Stack Rationale|Tech Stack Rationale]]
- [[_COMMUNITY_Request Lifecycle|Request Lifecycle]]
- [[_COMMUNITY_Product Requirements|Product Requirements]]
- [[_COMMUNITY_Development Rules|Development Rules]]
- [[_COMMUNITY_Phase Tracker|Phase Tracker]]
- [[_COMMUNITY_Frontend QA Review|Frontend QA Review]]
- [[_COMMUNITY_Git Convention|Git Convention]]
- [[_COMMUNITY_Dev Instructions|Dev Instructions]]
- [[_COMMUNITY_File Icon Asset|File Icon Asset]]
- [[_COMMUNITY_Globe Icon Asset|Globe Icon Asset]]
- [[_COMMUNITY_Window Icon Asset|Window Icon Asset]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]

## God Nodes (most connected - your core abstractions)
1. `createError()` - 37 edges
2. `useAuthStore` - 25 edges
3. `AuctionHaus Backend — Full Technical Deep Dive` - 19 edges
4. `AuctionHaus — Complete System Documentation` - 16 edges
5. `done` - 16 edges
6. `AuthRequest` - 12 edges
7. `authenticate()` - 12 edges
8. `prismaMock` - 12 edges
9. `notifyUser()` - 11 edges
10. `16. API Reference` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Logo SVG` --conceptually_related_to--> `Frontend Architecture (Next.js 15)`  [INFERRED]
  front/public/next.svg → xdocs/bible.md
- `Vercel Logo SVG` --conceptually_related_to--> `Frontend Architecture (Next.js 15)`  [INFERRED]
  front/public/vercel.svg → xdocs/bible.md
- `Backend Technical Deep Dive` --semantically_similar_to--> `Complete System Documentation`  [INFERRED] [semantically similar]
  back/learn.md → xdocs/bible.md
- `Database Design Decisions` --semantically_similar_to--> `Prisma Schema (10 Models)`  [INFERRED] [semantically similar]
  back/learn.md → xdocs/bible.md
- `Wallet Escrow Design` --semantically_similar_to--> `Escrow Service Settlement`  [INFERRED] [semantically similar]
  back/learn.md → xdocs/bible.md

## Hyperedges (group relationships)
- **Three Auction Types** — english_auction_type, dutch_auction_type, sealed_bid_auction_type [EXTRACTED 1.00]
- **Financial Integrity Chain** — bible_wallet_system, bible_escrow_service, pessimistic_locking_pattern, prisma_transaction_pattern [INFERRED 0.85]
- **Real-Time Event Pipeline** — bible_realtime_system, bible_bidding_engine, bible_autobid_engine, notification_dual_delivery [INFERRED 0.85]

## Communities (84 total, 25 thin omitted)

### Community 0 - "Frontend Pages & UI"
Cohesion: 0.05
Nodes (48): cancelAutoBid(), getMyAutoBid(), processAutoBids(), setAutoBid(), defaultAuction, dutchAuction, secondAutoBid, topAutoBid (+40 more)

### Community 1 - "Admin & API Controllers"
Cohesion: 0.05
Nodes (43): AdminPage(), AdminStats, inter, metadata, Auction, AuctionCard(), AuctionsPage(), lotNumber() (+35 more)

### Community 2 - "Backend Service Layer"
Cohesion: 0.05
Nodes (23): router, router, cancelAutoBid(), getMyAutoBid(), setAutoBid(), mockResult, nextFunction, router (+15 more)

### Community 3 - "Auto-Bid & Queue Engine"
Cohesion: 0.1
Nodes (19): router, initSocketGateway(), nextFn, bullMQConnection, redis, redisPub, redisSub, rateLimiter (+11 more)

### Community 4 - "Prisma Client & Scripts"
Cohesion: 0.12
Nodes (12): createAuction(), createAuctionSchema, auction, buyNow(), cancelAuction(), createAuction(), getAuctionById(), mockData (+4 more)

### Community 5 - "Auction Create Form"
Cohesion: 0.15
Nodes (9): profile, getBidHistory(), getMyAuctions(), getUserProfile(), getWonAuctions(), rateUser(), mockProfile, mockUpdate (+1 more)

### Community 6 - "Financial Integrity Core"
Cohesion: 0.16
Nodes (8): stats, getAllAuctions(), getAllUsers(), getDashboardStats(), getFraudFlags(), moderateAuction(), suspendUser(), mockGroupBy

### Community 7 - "User Profile Controllers"
Cohesion: 0.11
Nodes (17): 🛡️ Admin Panel, 🏷️ Auction Features, 🏛️ AuctionHaus, 🤖 Auto-Bidding System, 🧠 Backend Architecture (High Level), 🏗️ Backend Repo, 🔥 Core Features (High-Level), 📊 Dashboard (+9 more)

### Community 8 - "Frontend Architecture"
Cohesion: 0.11
Nodes (17): bugs fixed (from frontend_suggestion.md QA report), 🔴 Critical Bugs (Financial & Integrity), done, 🟠 High Severity (Logic & Concurrency), 🟡 Medium Severity (UX & Architecture), Phase 1: Critical Backend Bug Fixes (From QA Report & Errors), Phase 2.5: Deep Code Audit Findings (Backend Concurrency & Edge Cases), Phase 2.6: Backend Architectural Refinement & Security (Auditor Findings) (+9 more)

### Community 9 - "Notification Controllers"
Cohesion: 0.2
Nodes (12): getMe(), login(), loginSchema, register(), registerSchema, mockResult, nextFunction, generateToken() (+4 more)

### Community 10 - "App Layout & Providers"
Cohesion: 0.13
Nodes (14): 1. Extracted Reusable UI Components (High Priority), 2. Unified Error Handling & Validation (Form Level), 3. Next.js Middleware Route Protection, 4. Dedicated WebSocket Custom Hook, 5. Skeleton Loaders instead of Text, 6. Centralized Error Normalization, Critical & High Priority, 📌 Executive Summary (+6 more)

### Community 11 - "Route Middleware"
Cohesion: 0.15
Nodes (12): 10. Background Jobs (BullMQ), code:block32 (auction-scheduler  → start-auction, end-auction jobs), code:typescript (const startDelay = new Date(data.startTime).getTime() - Date), code:block34 (1. Fetch auction from DB), code:block35 (1. Fetch auction with winning bid), code:block37 (Every 10 minutes:), Dutch Price Drop Job (Recurring), end-auction Job / endAuction Function (+4 more)

### Community 12 - "Auction Scheduler & Dutch"
Cohesion: 0.15
Nodes (12): 12. Watchlist, 15. Request Lifecycle (End to End), 1. Tech Stack & Why, 2. Project Entry Point, AuctionHaus Backend — Full Technical Deep Dive, code:block1 (1. Load environment variables (.env)), code:typescript (const app = express();), code:typescript (app.use((req, _res, next) => {) (+4 more)

### Community 13 - "Database Schema Design"
Cohesion: 0.17
Nodes (11): 11. Security Measures, 12. Test Accounts (from seed), 13. Known Issues (from checklist.md), 14. Data Flow: Bid Placement, 15. Data Flow: Auction End, 1. What This Codebase Does, 2. Folder Structure, AuctionHaus — Complete System Documentation (+3 more)

### Community 14 - "Real-Time Socket Layer"
Cohesion: 0.22
Nodes (8): bannerStyle, CreateAuctionPage(), FieldErrors, fieldErrStyle, FormState, gridTwo, inputStyle(), submitStyle()

### Community 15 - "Security & Middleware"
Cohesion: 0.18
Nodes (11): 4. Authentication System, Auth Middleware, code:block10 (eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InV1aWQiLCJlbWFpbCI6Ii4uLiIsInJ), code:typescript (// 1. Check Authorization header exists), code:typescript (const registerSchema = z.object({), code:block8 (Client                          Server), code:typescript (// Registration), How JWT Auth Works (+3 more)

### Community 16 - "API Routes & Catalogue"
Cohesion: 0.2
Nodes (10): 5. Auction Module, Buy Now, code:typescript (POST /api/auctions), code:typescript (dutchPriceStep: 50,     // drop price by 50 every...), code:block15 (POST /api/auctions/:id/buy-now), code:typescript (GET /api/auctions?status=ACTIVE&type=ENGLISH&search=rolex&pa), Creating an Auction, Dutch Auction Specifics (+2 more)

### Community 17 - "Frontend ESLint Config"
Cohesion: 0.2
Nodes (10): 6. Bidding Engine (Core Logic), After a Bid is Placed, Anti-Sniping Logic, code:block17 (User calls POST /api/bids/auctions/:id  { amount: 5500 }), code:block18 (1. Validate amount === auction.currentPrice (exactly, no hig), code:block19 (1. Validate amount > startingPrice), code:typescript (const endTime = new Date(auction.endTime);), Dutch Auction Flow (+2 more)

### Community 18 - "Next.js Config"
Cohesion: 0.2
Nodes (10): 16. API Reference, Admin, Auctions, Auth, Bidding, Notifications, Payments, Users (+2 more)

### Community 19 - "PostCSS Config"
Cohesion: 0.2
Nodes (10): 6. API Route Map, Admin (`/api/admin`) — Admin only, Auctions (`/api/auctions`), Auth (`/api/auth`) — Public, Bidding (`/api/bids`), Notifications (`/api/notifications`), Payments (`/api/payments`), Users (`/api/users`) (+2 more)

### Community 20 - "Landing Page"
Cohesion: 0.2
Nodes (9): code:bash (docker run --name auctionhaus-redis -p 6379:6379 -d redis:al), code:yaml (version: '3.8'), code:bash (docker compose up -d), code:env (# Comment out production Upstash Redis), Environment Variable Setup, Local Redis Setup for Development, Option 1: Quick Start (Single Command), Option 2: Docker Compose Setup (+1 more)

### Community 21 - "System Documentation"
Cohesion: 0.2
Nodes (10): Bidding Engine Architecture, Escrow Service Settlement, Wallet System (Pessimistic Lock), Critical Bug Fixes (Phase 1), Deep Audit: Concurrency Fixes, Escrow Centralization, Wallet Escrow Design, Pessimistic Locking Pattern (+2 more)

### Community 22 - "Auto-Bid Algorithm"
Cohesion: 0.22
Nodes (7): basename, files, fs, ignorePatterns, path, srcDir, testFile

### Community 23 - "Backend Architecture"
Cohesion: 0.22
Nodes (9): 9. Real-Time Layer (Socket.io), Authentication for Sockets, code:block28 (auction:{auctionId}  → everyone watching a specific auction), code:javascript (socket.emit('auction:join', auctionId);), code:typescript (io.to(`auction:${auctionId}`).emit('bid:new', { bid });), code:typescript (io.use((socket, next) => {), Events Reference, How Socket.io Works (+1 more)

### Community 24 - "Design System Philosophy"
Cohesion: 0.22
Nodes (9): 17. How to Run, code:bash (# Start Postgres and Redis), code:bash (# 1. Install dependencies), code:bash (# 1. Login), Prerequisites, Quick Start with Docker (Recommended), Quick Test Flow, Setup Steps (+1 more)

### Community 25 - "English Auction & Sniping"
Cohesion: 0.22
Nodes (9): 7.1 Bidding Engine (`bid.service.ts`), 7.2 Auto-Bid Engine (`auto-bid.service.ts`), 7.3 Auction Scheduler (`auction.scheduler.ts`), 7.4 Escrow Service (`escrow.service.ts`), 7.5 Wallet System (`wallet.service.ts`), 7. Core Business Logic, code:block3 (1. Validate auction is ACTIVE), code:block4 (1. Fetch all ACTIVE auto-bids for the auction (excluding cur) (+1 more)

### Community 26 - "Auth System & JWT"
Cohesion: 0.25
Nodes (8): 3. Database Design (Prisma Schema), code:block4 (User), code:block5 (balance = 1000), code:block6 (ACTIVE    → just placed, auction still open), code:bash (npx prisma migrate dev --name init), Key Design Decisions, Models Overview, Prisma Migrations

### Community 27 - "Backend ESLint"
Cohesion: 0.25
Nodes (8): 8. Wallet & Mock Payments, code:block24 (Wallet {), code:block25 (POST /api/wallet/deposit   { amount: 5000 }), code:block26 (POST /api/payments/auctions/:id/confirm), code:block27 (1. Verify auction ended and caller is the winner), Mock Deposit/Withdraw, Payment Settlement (Winner Confirms), Wallet Model

### Community 28 - "Next.js Types"
Cohesion: 0.29
Nodes (7): 14. Middleware Stack, code:block44 (Request → [helmet] → [cors] → [morgan] → [json] → [rateLimit), code:typescript (// General: 200 requests per 15 minutes), code:typescript (app.use(errorHandler); // MUST be last), code:typescript (// In any service:), How Express Middleware Works, Middleware in This Project

### Community 29 - "Project Root"
Cohesion: 0.29
Nodes (7): 7. Auto-Bid System, Auto-Bid Deactivation, code:block21 (POST /api/bids/auctions/:id/auto-bid  { maxAmount: 8000 }), code:block22 (1. Get all active auto-bids for this auction), code:block23 (Round 1: processAutoBids() called), Priority Queue Algorithm, Setting an Auto-Bid

### Community 30 - "Tech Stack Rationale"
Cohesion: 0.29
Nodes (7): Frontend Architecture (Next.js 15), Known Issues, Frontend QA Bug Report, React Query Server State, Next.js Logo SVG, Vercel Logo SVG, Zustand Client State Management

### Community 31 - "Request Lifecycle"
Cohesion: 0.33
Nodes (5): ah-back, code:bash (back/), code:bash (Setup DB — update DATABASE_URL in .env), Project Structure, to run

### Community 32 - "Product Requirements"
Cohesion: 0.33
Nodes (6): 5. Authentication System, code:typescript (const userCache = new Map<string, { user: User; timestamp: n), Flow, Frontend Route Protection, In-Memory Auth Cache, Token Details

### Community 33 - "Development Rules"
Cohesion: 0.4
Nodes (3): AUTH_ROUTES, config, PROTECTED_ROUTES

### Community 34 - "Phase Tracker"
Cohesion: 0.4
Nodes (5): 11. Notifications, code:typescript (export const notifyUser = async (userId, data) => {), code:typescript (enum NotificationType {), Dual Delivery System, Notification Types

### Community 35 - "Frontend QA Review"
Cohesion: 0.4
Nodes (5): 13. Admin Panel, code:typescript (router.use(authenticate, requireAdmin);), code:typescript (// Find bidders with > 10 non-auto outbid bids), Dashboard Stats, Fraud Detection

### Community 36 - "Git Convention"
Cohesion: 0.4
Nodes (5): 9. Frontend Architecture, Auth Flow (Client), Design System (globals.css), Key Pages, State Management

### Community 37 - "Dev Instructions"
Cohesion: 0.5
Nodes (4): 8. Real-Time System (Socket.io), Client Usage, Gateway Events (`socket.gateway.ts`), Server Setup (`index.ts`)

### Community 38 - "File Icon Asset"
Cohesion: 0.5
Nodes (4): 4. Database Schema (Prisma), DB Hardening Script (`scripts/db-hardening.ts`), Key Relations, Models & Key Fields

### Community 39 - "Globe Icon Asset"
Cohesion: 0.5
Nodes (3): code:block1 (if (autoBids.length > 1) {), code:block2 (setImmediate(() => {), code:block3 (// Recursively process if the previous winner also has an au)

### Community 40 - "Window Icon Asset"
Cohesion: 0.5
Nodes (3): code:block1 (const onStateChange = () => {), code:block2 (const handleSync = () => {), code:block3 (const onBidNew = (data: { bid?: { id: string } }) => {)

### Community 41 - "Community 41"
Cohesion: 0.5
Nodes (4): Auction Scheduler (node-cron), Dutch Auction Type, BullMQ Background Jobs Design, Local Redis Docker Setup

### Community 42 - "Community 42"
Cohesion: 0.67
Nodes (3): 3. Environment Variables, Backend (`back/.env`), Frontend (`front/.env.local`)

### Community 43 - "Community 43"
Cohesion: 0.67
Nodes (3): 10. Dependencies, Backend, Frontend

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (3): Prisma Schema (10 Models), Architecture Hardening (Phase 2), Database Design Decisions

### Community 47 - "Community 47"
Cohesion: 0.67
Nodes (3): Security Measures Matrix, Final Hardening (Phase 6), Middleware Pipeline Design

### Community 48 - "Community 48"
Cohesion: 0.67
Nodes (3): Auction Item Catalogue (100 items), API Route Map, Core Feature Requirements

### Community 49 - "Community 49"
Cohesion: 0.67
Nodes (3): Real-Time Socket.io System, Socket.io Room Architecture, Notification Dual Delivery System

## Knowledge Gaps
- **317 isolated node(s):** `fs`, `path`, `srcDir`, `ignorePatterns`, `files` (+312 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `io` connect `Frontend Pages & UI` to `Admin & API Controllers`, `Auto-Bid & Queue Engine`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `getSocket()` connect `Admin & API Controllers` to `Frontend Pages & UI`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `createError()` connect `Frontend Pages & UI` to `Notification Controllers`, `Prisma Client & Scripts`, `Auction Create Form`, `Financial Integrity Core`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `srcDir` to the rest of the system?**
  _317 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Pages & UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Admin & API Controllers` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Backend Service Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._