import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  io?: import('socket.io').Server;
}

/**
 * Phase A9: in-memory user cache.
 *
 * Every authed request used to hit Postgres for `user.findUnique` just to
 * check existence + suspension. On a hot listing page that's one DB
 * round-trip per static-asset-ish call. A 30s TTL cache erases the cost
 * while keeping the suspend-revocation latency bounded -- a suspended user
 * will still be allowed in for up to 30s, which is fine for a college
 * project (a production app would use a Redis pub/sub channel for instant
 * invalidation, queued under Phase A8.x).
 *
 * Active invalidation: `admin.service.suspendUser` calls `invalidateUser`
 * after flipping the row, so the cache evicts immediately on the
 * single-process instance that handled the suspend. Cross-instance
 * invalidation is a future task.
 */
type CachedUser = {
  id: string;
  email: string;
  role: string;
  isSuspended: boolean;
};

const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<string, { user: CachedUser; expiresAt: number }>();

export const invalidateUser = (userId: string): void => {
  userCache.delete(userId);
};

const cacheGet = (userId: string): CachedUser | null => {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    userCache.delete(userId);
    return null;
  }
  return entry.user;
};

const cacheSet = (user: CachedUser): void => {
  userCache.set(user.id, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
};

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      role: string;
    };

    // Cache hit short-circuits the DB lookup. We still re-check
    // isSuspended on every request because that's the whole point of the
    // per-request check: a JWT alone says nothing about current account
    // state.
    let user: CachedUser | null = cacheGet(payload.id);
    if (!user) {
      const fresh = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, email: true, role: true, isSuspended: true },
      });
      if (!fresh) {
        res.status(401).json({ message: 'User not found' });
        return;
      }
      user = fresh;
      cacheSet(fresh);
    }

    if (user.isSuspended) {
      res.status(403).json({ message: 'Account suspended' });
      return;
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  next();
};
