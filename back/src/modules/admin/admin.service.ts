import { AuctionStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { serializeMoney, toNum } from '../../lib/decimal';
import { invalidateUser } from '../../middleware/auth.middleware';

export const getDashboardStats = async () => {
  const [
    totalUsers,
    totalAuctions,
    activeAuctions,
    totalBids,
    totalRevenue,
    recentUsers,
    recentAuctions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.auction.count(),
    prisma.auction.count({ where: { status: AuctionStatus.ACTIVE } }),
    prisma.bid.count(),
    prisma.transaction.aggregate({
      where: { type: 'PAYMENT', status: 'COMPLETED' },
      _sum: { amount: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, email: true, createdAt: true, isSuspended: true },
    }),
    prisma.auction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, status: true, currentPrice: true, createdAt: true },
    }),
  ]);

  // Phase A1: aggregate _sum returns Decimal; convert at the boundary.
  return {
    totalUsers,
    totalAuctions,
    activeAuctions,
    totalBids,
    totalRevenue: toNum(totalRevenue._sum.amount) ?? 0,
    recentUsers,
    recentAuctions: serializeMoney(recentAuctions),
  };
};

export const getAllUsers = async (params: {
  page?: number;
  limit?: number;
  search?: string;
}) => {
  const { page = 1, limit = 20, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, role: true,
        isSuspended: true, rating: true, createdAt: true,
        _count: { select: { bids: true, auctions: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit };
};

export const suspendUser = async (userId: string, suspend: boolean) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createError('User not found', 404);
  if (user.role === 'ADMIN') throw createError('Cannot suspend admin', 400);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isSuspended: suspend },
    select: { id: true, name: true, email: true, isSuspended: true },
  });

  // Phase A9: evict the auth-middleware cache so the suspended user can't
  // keep getting through on a TTL-cached entry for up to 30s. Single-process
  // only -- a multi-instance deployment would need Redis pub/sub here.
  invalidateUser(userId);

  return updated;
};

export const getAllAuctions = async (params: {
  page?: number;
  limit?: number;
  status?: AuctionStatus;
}) => {
  const { page = 1, limit = 20, status } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.AuctionWhereInput = {};
  if (status) where.status = status;

  const [auctions, total] = await Promise.all([
    prisma.auction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        seller: { select: { id: true, name: true, email: true } },
        _count: { select: { bids: true } },
      },
    }),
    prisma.auction.count({ where }),
  ]);

  return { auctions: serializeMoney(auctions), total, page, limit };
};

export const moderateAuction = async (auctionId: string, action: 'cancel' | 'activate') => {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw createError('Auction not found', 404);

  const status = action === 'cancel' ? AuctionStatus.CANCELLED : AuctionStatus.ACTIVE;
  const updated = await prisma.auction.update({
    where: { id: auctionId },
    data: { status },
  });
  return serializeMoney(updated);
};

export const getFraudFlags = async () => {
  // Simple fraud detection: users with many bids that get outbid repeatedly (potential shills)
  const suspiciousBidders = await prisma.bid.groupBy({
    by: ['bidderId'],
    where: { status: 'OUTBID', isAutoBid: false },
    _count: { id: true },
    having: { id: { _count: { gt: 10 } } },
    orderBy: { _count: { id: 'desc' } },
    take: 20,
  });

  const bidderIds = suspiciousBidders.map((b) => b.bidderId);
  const users = await prisma.user.findMany({
    where: { id: { in: bidderIds } },
    select: { id: true, name: true, email: true, isSuspended: true },
  });

  return suspiciousBidders.map((sb) => ({
    ...sb,
    user: users.find((u) => u.id === sb.bidderId),
    outbidCount: sb._count.id,
  }));
};
