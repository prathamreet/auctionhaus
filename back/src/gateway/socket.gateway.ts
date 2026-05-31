import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

/**
 * Socket.io Gateway
 * Handles real-time bidding events and user connections.
 *
 * Rooms:
 *  - auction:{auctionId} — join to get live bid updates for an auction
 *  - user:{userId}       — personal room for notifications
 *
 * Phase E8: per-auction live viewer count emitted as `auction:presence`.
 *
 * Trailing-edge debounce, 250 ms — covers the bursts that happen when a hot
 * auction page is opened from a tab group (Chrome wakes all hidden tabs and
 * each fires its `auction:join` within the same animation frame). Without
 * the debounce, every joiner would trigger one emit per existing viewer
 * (O(N²) socket frames). With it, each burst collapses to a single emit
 * carrying the final post-burst count.
 *
 * The `fetchSockets()` call uses the Socket.io adapter, so the count is
 * cluster-wide when the Redis adapter (Phase A8) is active.
 */
const PRESENCE_DEBOUNCE_MS = 250;
const presenceTimers = new Map<string, NodeJS.Timeout>();

const schedulePresenceEmit = (io: Server, auctionId: string) => {
  const room = `auction:${auctionId}`;
  // If a debounce is already pending for this room, leave it alone -- it will
  // fire shortly and capture the current count. Otherwise schedule a fresh one.
  if (presenceTimers.has(room)) return;
  const timer = setTimeout(async () => {
    presenceTimers.delete(room);
    try {
      const sockets = await io.in(room).fetchSockets();
      io.to(room).emit('auction:presence', {
        auctionId,
        viewers: sockets.length,
      });
    } catch {
      // adapter error -- emit nothing rather than emit a bogus count
    }
  }, PRESENCE_DEBOUNCE_MS);
  presenceTimers.set(room, timer);
};

export const initSocketGateway = (io: Server) => {
  // Authentication middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      // Allow unauthenticated for watching auctions
      socket.data.userId = null;
      return next();
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string;
        email: string;
        role: string;
      };
      socket.data.userId = payload.id;
      socket.data.userRole = payload.role;
      next();
    } catch {
      socket.data.userId = null;
      next(); // still allow connection, just unauthenticated
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId;
    const userRole = socket.data.userRole;

    // Join personal notification room if authenticated
    if (userId) {
      socket.join(`user:${userId}`);

      // Phase C2/C3: admins join the fraud monitoring room to receive fraud:flag
      // events emitted by FraudEngine. The room is named 'admin:fraud' to
      // distinguish it from the per-auction 'auction:{id}' rooms.
      if (userRole === 'ADMIN') {
        socket.join('admin:fraud');
      }

      console.log(`Socket: user ${userId} connected`);
    }

    // ── Join auction room ──
    socket.on('auction:join', (auctionId: string) => {
      if (!auctionId) return;
      socket.join(`auction:${auctionId}`);
      socket.emit('auction:joined', { auctionId });
      schedulePresenceEmit(io, auctionId);
    });

    // ── Leave auction room ──
    socket.on('auction:leave', (auctionId: string) => {
      socket.leave(`auction:${auctionId}`);
      schedulePresenceEmit(io, auctionId);
    });

    // Phase E8: presence on disconnect. socket.io fires `disconnecting`
    // BEFORE the rooms are cleared, so socket.rooms still contains the
    // auction rooms this socket was watching. After `disconnect` they're
    // already gone and fetchSockets would return one extra.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('auction:')) {
          const auctionId = room.slice('auction:'.length);
          schedulePresenceEmit(io, auctionId);
        }
      }
    });

    // ── Request current bid (for sync on reconnect) ──
    socket.on('auction:sync', async (auctionId: string) => {
      try {
        const { prisma } = await import('../lib/prisma');
        const { serializeMoney } = await import('../lib/decimal');
        const auction = await prisma.auction.findUnique({
          where: { id: auctionId },
          select: {
            id: true,
            currentPrice: true,
            status: true,
            endTime: true,
            _count: { select: { bids: true } },
          },
        });
        // Phase A1: convert currentPrice Decimal -> number at the socket edge.
        if (auction) socket.emit('auction:state', serializeMoney(auction));
      } catch {
        // ignore
      }
    });

    socket.on('disconnect', () => {
      if (userId) {
        console.log(`Socket: user ${userId} disconnected`);
      }
    });
  });
};
