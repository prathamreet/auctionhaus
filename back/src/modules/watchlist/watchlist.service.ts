import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';

export const getWatchlist = async (userId: string) => {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      auction: {
        select: {
          id: true,
          title: true,
          currentPrice: true,
          status: true,
          endTime: true,
          imageUrl: true,
          type: true,
          _count: { select: { bids: true } },
        },
      },
    },
  });
  return items;
};

export const addToWatchlist = async (userId: string, auctionId: string) => {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw createError('Auction not found', 404);

  const item = await prisma.watchlistItem.upsert({
    where: { userId_auctionId: { userId, auctionId } },
    update: {},
    create: { userId, auctionId },
  });
  return item;
};

export const removeFromWatchlist = async (userId: string, auctionId: string) => {
  const item = await prisma.watchlistItem.findUnique({
    where: { userId_auctionId: { userId, auctionId } },
  });
  if (!item) throw createError('Not in watchlist', 404);

  await prisma.watchlistItem.delete({
    where: { userId_auctionId: { userId, auctionId } },
  });
  return { message: 'Removed from watchlist' };
};
