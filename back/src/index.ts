import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server } from 'socket.io';

import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { initSocketGateway } from './gateway/socket.gateway';
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

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    try {
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 2000))
      ]);
      console.log('✅ Redis connected');

      initWorkers();
      console.log('✅ BullMQ workers started');
    } catch (_redisErr) {
      console.warn('⚠️ Could not connect to Redis on startup. Real-time features and scheduled jobs will be disabled.');
      // Proceed without crashing the server
    }

    initSocketGateway(io);
    console.log('✅ Socket.io gateway initialized');

    httpServer.listen(PORT, () => {
      console.log(`🚀 AuctionHaus backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();

export { io };
