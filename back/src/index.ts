import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server } from 'socket.io';

import { createAdapter } from '@socket.io/redis-adapter';

import { prisma } from './lib/prisma';
import { redis, redisPub, redisSub, redisInvalidateSub } from './lib/redis';
import { initSocketGateway } from './gateway/socket.gateway';
import { invalidateUser } from './middleware/auth.middleware';
import { initWorkers } from './workers';

import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import auctionRoutes from './modules/auctions/auction.routes';
import bidRoutes from './modules/bidding/bid.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import watchlistRoutes from './modules/watchlist/watchlist.routes';
import adminRoutes from './modules/admin/admin.routes';
import paymentRoutes from './modules/payments/payment.routes';
import fraudRoutes from './modules/fraud/fraud.routes';
import { FraudEngine } from './modules/fraud/fraud.engine';

import { errorHandler } from './middleware/error.middleware';
import { rateLimiter } from './middleware/rateLimiter.middleware';

const app = express();
const httpServer = http.createServer(app);

// Trust Railway's reverse proxy so express-rate-limit can read real client IPs
app.set('trust proxy', 1);

// ─── Socket.io Setup ─────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ─── Global Middleware ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(rateLimiter);

// Attach io to request
interface ExtendedRequest extends Request {
  io?: import('socket.io').Server;
}

app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as ExtendedRequest).io = io;
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/fraud', fraudRoutes);

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    await prisma.$connect();
    console.log('[ok] Database connected');

    try {
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 2000))
      ]);
      console.log('[ok] Redis connected');

      // Phase A8: wire the Socket.io Redis adapter so a multi-instance deploy
      // can broadcast across nodes. Single-instance dev keeps working since
      // the adapter just routes through Redis pub/sub for the room fan-out.
      // The two redisPub / redisSub connections were already allocated in
      // lib/redis.ts and unused -- they earn their keep here.
      io.adapter(createAdapter(redisPub, redisSub));
      console.log('[ok] Socket.io Redis adapter connected');

      // Phase A9.x: cross-instance auth-cache invalidation. admin.suspendUser
      // publishes the suspended userId on 'user:invalidate'; every instance
      // (including the publisher) evicts its in-memory userCache so a suspended
      // account stops authenticating everywhere at once, not just on the node
      // that handled the suspend. invalidateUser is idempotent, so receiving
      // our own publish is harmless.
      await redisInvalidateSub.subscribe('user:invalidate');
      redisInvalidateSub.on('message', (channel, message) => {
        if (channel === 'user:invalidate' && message) invalidateUser(message);
      });
      console.log('[ok] Auth-cache invalidation channel subscribed');

      initWorkers();
      console.log('[ok] BullMQ workers started');
    } catch (_redisErr) {
      console.warn('[warn] Could not connect to Redis on startup. Real-time features and scheduled jobs will be disabled.');
      // Proceed without crashing the server. Socket.io falls back to its
      // in-memory adapter (single-instance only).
    }

    initSocketGateway(io);
    console.log('[ok] Socket.io gateway initialized');

    // Phase C2/C3: wire the fraud detection engine so it can emit fraud:flag
    // events to the admin socket room after each bid commits.
    FraudEngine.getInstance().init(io);
    console.log('[ok] Fraud detection engine initialised');

    httpServer.listen(PORT, () => {
      console.log(`[ready] AuctionHaus backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[fail] Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}

export { io };
