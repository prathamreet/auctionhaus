# Graph Report - .  (2026-05-12)

## Corpus Check
- Corpus is ~44,609 words - fits in a single context window. You may not need a graph.

## Summary
- 332 nodes · 499 edges · 41 communities (17 shown, 24 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend Pages & UI|Frontend Pages & UI]]
- [[_COMMUNITY_Admin & API Controllers|Admin & API Controllers]]
- [[_COMMUNITY_Backend Service Layer|Backend Service Layer]]
- [[_COMMUNITY_Auto-Bid & Queue Engine|Auto-Bid & Queue Engine]]
- [[_COMMUNITY_Prisma Client & Scripts|Prisma Client & Scripts]]
- [[_COMMUNITY_Auction Create Form|Auction Create Form]]
- [[_COMMUNITY_Financial Integrity Core|Financial Integrity Core]]
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
- [[_COMMUNITY_System Documentation|System Documentation]]
- [[_COMMUNITY_Auto-Bid Algorithm|Auto-Bid Algorithm]]
- [[_COMMUNITY_Backend Architecture|Backend Architecture]]
- [[_COMMUNITY_Design System Philosophy|Design System Philosophy]]
- [[_COMMUNITY_English Auction & Sniping|English Auction & Sniping]]
- [[_COMMUNITY_Auth System & JWT|Auth System & JWT]]
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

## God Nodes (most connected - your core abstractions)
1. `createError()` - 36 edges
2. `useAuthStore` - 25 edges
3. `AuthRequest` - 11 edges
4. `authenticate()` - 11 edges
5. `getSocket()` - 9 edges
6. `notifyUser()` - 7 edges
7. `parseApiError()` - 6 edges
8. `io` - 5 edges
9. `processAutoBids()` - 5 edges
10. `reconnectSocket()` - 5 edges

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

## Communities (41 total, 24 thin omitted)

### Community 0 - "Frontend Pages & UI"
Cohesion: 0.06
Nodes (41): AdminPage(), AdminStats, Auction, AuctionCard(), AuctionsPage(), lotNumber(), AuthProvider(), Navbar() (+33 more)

### Community 1 - "Admin & API Controllers"
Cohesion: 0.05
Nodes (23): router, router, loginSchema, registerSchema, router, router, router, initSocketGateway() (+15 more)

### Community 2 - "Backend Service Layer"
Cohesion: 0.07
Nodes (25): moderateAuction(), suspendUser(), createAuction(), createAuctionSchema, buyNow(), cancelAuction(), createAuction(), getAuctionById() (+17 more)

### Community 3 - "Auto-Bid & Queue Engine"
Cohesion: 0.09
Nodes (20): processAutoBids(), setAutoBid(), placeBid(), getAuctionBids(), placeBid(), bullMQConnection, redis, redisPub (+12 more)

### Community 5 - "Auction Create Form"
Cohesion: 0.22
Nodes (8): bannerStyle, CreateAuctionPage(), FieldErrors, fieldErrStyle, FormState, gridTwo, inputStyle(), submitStyle()

### Community 6 - "Financial Integrity Core"
Cohesion: 0.2
Nodes (10): Bidding Engine Architecture, Escrow Service Settlement, Wallet System (Pessimistic Lock), Critical Bug Fixes (Phase 1), Deep Audit: Concurrency Fixes, Escrow Centralization, Wallet Escrow Design, Pessimistic Locking Pattern (+2 more)

### Community 8 - "Frontend Architecture"
Cohesion: 0.29
Nodes (7): Frontend Architecture (Next.js 15), Known Issues, Frontend QA Bug Report, React Query Server State, Next.js Logo SVG, Vercel Logo SVG, Zustand Client State Management

### Community 11 - "Route Middleware"
Cohesion: 0.4
Nodes (3): AUTH_ROUTES, config, PROTECTED_ROUTES

### Community 12 - "Auction Scheduler & Dutch"
Cohesion: 0.5
Nodes (4): Auction Scheduler (node-cron), Dutch Auction Type, BullMQ Background Jobs Design, Local Redis Docker Setup

### Community 13 - "Database Schema Design"
Cohesion: 0.67
Nodes (3): Prisma Schema (10 Models), Architecture Hardening (Phase 2), Database Design Decisions

### Community 14 - "Real-Time Socket Layer"
Cohesion: 0.67
Nodes (3): Real-Time Socket.io System, Socket.io Room Architecture, Notification Dual Delivery System

### Community 15 - "Security & Middleware"
Cohesion: 0.67
Nodes (3): Security Measures Matrix, Final Hardening (Phase 6), Middleware Pipeline Design

### Community 16 - "API Routes & Catalogue"
Cohesion: 0.67
Nodes (3): Auction Item Catalogue (100 items), API Route Map, Core Feature Requirements

## Knowledge Gaps
- **103 isolated node(s):** `app`, `httpServer`, `ExtendedRequest`, `globalForPrisma`, `redisPub` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `io` connect `Auto-Bid & Queue Engine` to `Frontend Pages & UI`, `Admin & API Controllers`?**
  _High betweenness centrality (0.268) - this node is a cross-community bridge._
- **Why does `getSocket()` connect `Frontend Pages & UI` to `Auto-Bid & Queue Engine`?**
  _High betweenness centrality (0.267) - this node is a cross-community bridge._
- **Why does `createError()` connect `Backend Service Layer` to `Auto-Bid & Queue Engine`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **What connects `app`, `httpServer`, `ExtendedRequest` to the rest of the system?**
  _103 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Pages & UI` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Admin & API Controllers` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Backend Service Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._