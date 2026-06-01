import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { serializeMoney } from '../../lib/decimal';

export const getUserProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      rating: true,
      ratingCount: true,
      createdAt: true,
      _count: {
        select: {
          auctions: true,
          bids: true,
        },
      },
    },
  });

  if (!user) throw createError('User not found', 404);
  return user;
};

export const updateProfile = async (
  userId: string,
  data: { name?: string; avatar?: string }
) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, avatar: true },
  });
  return user;
};

export const getBidHistory = async (userId: string) => {
  const bids = await prisma.bid.findMany({
    where: { bidderId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      auction: {
        select: {
          id: true,
          title: true,
          status: true,
          endTime: true,
          currentPrice: true,
          imageUrl: true,
        },
      },
    },
  });
  // Phase A1: bid.amount + auction.currentPrice are Decimal -> number.
  return serializeMoney(bids);
};

export const getMyAuctions = async (userId: string) => {
  const auctions = await prisma.auction.findMany({
    where: { sellerId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { bids: true } },
    },
  });
  return serializeMoney(auctions);
};

export const getWonAuctions = async (userId: string) => {
  const auctions = await prisma.auction.findMany({
    where: { winnerId: userId },
    orderBy: { endTime: 'desc' },
    select: {
      id: true,
      title: true,
      currentPrice: true,
      imageUrl: true,
      endTime: true,
      type: true,
    },
  });
  return serializeMoney(auctions);
};

export const rateUser = async (data: {
  raterId: string;
  rateeId: string;
  auctionId: string;
  score: number;
  comment?: string;
}) => {
  if (data.raterId === data.rateeId) throw createError("Can't rate yourself", 400);
  if (data.score < 1 || data.score > 5) throw createError('Score must be 1-5', 400);

  const existing = await prisma.rating.findUnique({
    where: {
      raterId_rateeId_auctionId: {
        raterId: data.raterId,
        rateeId: data.rateeId,
        auctionId: data.auctionId,
      },
    },
  });
  if (existing) throw createError('Already rated this user for this auction', 409);

  const rating = await prisma.rating.create({ data });

  // Update the ratee's average rating
  const allRatings = await prisma.rating.aggregate({
    where: { rateeId: data.rateeId },
    _avg: { score: true },
    _count: { score: true },
  });

  await prisma.user.update({
    where: { id: data.rateeId },
    data: {
      rating: allRatings._avg.score || 0,
      ratingCount: allRatings._count.score,
    },
  });

  return rating;
};
