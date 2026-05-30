/**
 * Fraud admin service — database reads for the admin fraud dashboard.
 * The live stream comes via fraud:flag socket events; this provides the
 * historical view and supports the dismiss/warn/void-bid actions.
 */

import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';

export const getFraudFlags = async (params: {
  dismissed?: boolean;
  limit?: number;
  auctionId?: string;
  bidderId?: string;
}) => {
  const { dismissed = false, limit = 50, auctionId, bidderId } = params;

  const flags = await prisma.fraudFlag.findMany({
    where: {
      dismissed,
      ...(auctionId && { auctionId }),
      ...(bidderId && { bidderId }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      bidder: { select: { id: true, name: true, email: true, isSuspended: true } },
      auction: { select: { id: true, title: true, status: true } },
    },
  });

  return flags.map((f) => ({
    ...f,
    score: Number(f.score),
    features: f.features,
  }));
};

export const dismissFlag = async (flagId: string) => {
  const flag = await prisma.fraudFlag.findUnique({ where: { id: flagId } });
  if (!flag) throw createError('Flag not found', 404);
  return prisma.fraudFlag.update({ where: { id: flagId }, data: { dismissed: true } });
};

export const getFraudStats = async () => {
  const [total, undismissed, topBidders] = await Promise.all([
    prisma.fraudFlag.count(),
    prisma.fraudFlag.count({ where: { dismissed: false } }),
    prisma.fraudFlag.groupBy({
      by: ['bidderId'],
      _count: { id: true },
      _avg: { score: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
  ]);

  const bidderIds = topBidders.map((b) => b.bidderId);
  const users = await prisma.user.findMany({
    where: { id: { in: bidderIds } },
    select: { id: true, name: true, email: true, isSuspended: true },
  });

  return {
    total,
    undismissed,
    topBidders: topBidders.map((tb) => ({
      bidderId: tb.bidderId,
      flagCount: tb._count.id,
      avgScore: Number((tb._avg.score ?? 0).toFixed(3)),
      user: users.find((u) => u.id === tb.bidderId),
    })),
  };
};
