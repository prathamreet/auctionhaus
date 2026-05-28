import { AuctionStatus, AuctionType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { auctionQueue } from '../../queues/auction.queue';

export const createAuction = async (
  sellerId: string,
  data: {
    title: string;
    description: string;
    imageUrl?: string;
    type: AuctionType;
    startingPrice: number;
    reservePrice?: number;
    buyNowPrice?: number;
    dutchPriceStep?: number;
    dutchInterval?: number;
    minIncrement?: number;
    antiSnipingMins?: number;
    startTime: Date;
    endTime: Date;
  }
) => {
  if (new Date(data.startTime) >= new Date(data.endTime)) {
    throw createError('End time must be after start time', 400);
  }

  if (data.type === AuctionType.DUTCH && (!data.dutchPriceStep || !data.dutchInterval)) {
    throw createError('Dutch auctions require dutchPriceStep and dutchInterval', 400);
  }

  const auction = await prisma.auction.create({
    data: {
      sellerId,
      ...data,
      currentPrice: data.startingPrice,
      status: new Date(data.startTime) <= new Date() ? AuctionStatus.ACTIVE : AuctionStatus.PENDING,
    },
  });

  // Schedule auction start/end jobs
  const now = new Date();
  const startDelay = new Date(data.startTime).getTime() - now.getTime();
  const endDelay = new Date(data.endTime).getTime() - now.getTime();

  if (startDelay > 0) {
    await auctionQueue.add('start-auction', { auctionId: auction.id }, { delay: startDelay });
  }

  if (endDelay > 0) {
    await auctionQueue.add('end-auction', { auctionId: auction.id }, { delay: endDelay });
  }

  return auction;
};

export const getAuctions = async (params: {
  status?: AuctionStatus;
  type?: AuctionType;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  const { status, type, search, page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.AuctionWhereInput = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [auctions, total] = await Promise.all([
    prisma.auction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        seller: { select: { id: true, name: true, rating: true } },
        _count: { select: { bids: true } },
      },
    }),
    prisma.auction.count({ where }),
  ]);

  return { auctions, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getAuctionById = async (auctionId: string, userId?: string) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      seller: { select: { id: true, name: true, rating: true, avatar: true } },
      winner: { select: { id: true, name: true } },
      bids: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          bidder: { select: { id: true, name: true } },
        },
      },
      _count: { select: { bids: true, watchlist: true } },
    },
  });

  if (!auction) throw createError('Auction not found', 404);

  // Sealed-bid privacy: while live, strip the embedded bids array so the
  // detail-page fetch can't be used as a back-door to learn ranking or
  // bidder identities. The viewer's own bid is preserved so the UI can
  // render "your sealed bid: ₹X". The full list is exposed only after the
  // auction has ENDED. See bid.service.getAuctionBids for the matching
  // contract used by the bid-history endpoint.
  if (
    auction.type === AuctionType.SEALED_BID &&
    auction.status === AuctionStatus.ACTIVE
  ) {
    auction.bids = auction.bids
      .filter((b) => b.bidderId === userId)
      .map((b) => ({ ...b }));
  }

  // Check if user has it in watchlist
  let isWatched = false;
  if (userId) {
    const watchItem = await prisma.watchlistItem.findUnique({
      where: { userId_auctionId: { userId, auctionId } },
    });
    isWatched = !!watchItem;
  }

  // Check if user has auto-bid set
  let autoBid = null;
  if (userId) {
    autoBid = await prisma.autoBid.findUnique({
      where: { auctionId_bidderId: { auctionId, bidderId: userId } },
      select: { maxAmount: true, isActive: true },
    });
  }

  return { ...auction, isWatched, autoBid };
};

export const updateAuction = async (
  auctionId: string,
  sellerId: string,
  data: { title?: string; description?: string; imageUrl?: string }
) => {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw createError('Auction not found', 404);
  if (auction.sellerId !== sellerId) throw createError('Not your auction', 403);
  if (auction.status !== AuctionStatus.PENDING) {
    throw createError('Cannot edit an active or ended auction', 400);
  }

  return prisma.auction.update({ where: { id: auctionId }, data });
};

export const cancelAuction = async (auctionId: string, userId: string, isAdmin = false) => {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw createError('Auction not found', 404);

  if (!isAdmin && auction.sellerId !== userId) throw createError('Not authorized', 403);
  if (auction.status === AuctionStatus.ENDED) throw createError('Auction already ended', 400);

  // Refund all held bids
  const topBids = await prisma.bid.findMany({
    where: { auctionId, status: 'WINNING' },
    include: { bidder: { include: { wallet: true } } },
  });

  for (const bid of topBids) {
    if (bid.bidder.wallet) {
      await prisma.wallet.update({
        where: { id: bid.bidder.wallet.id },
        data: {
          balance: { increment: bid.amount },
          heldAmount: { decrement: bid.amount },
        },
      });
    }
  }

  return prisma.auction.update({
    where: { id: auctionId },
    data: { status: AuctionStatus.CANCELLED },
  });
};

export const buyNow = async (auctionId: string, buyerId: string) => {
  // Phase A2: All checks happen inside the transaction with FOR UPDATE locks.
  // Previously the status / wallet-balance checks happened outside the tx,
  // so two simultaneous buyNow requests could both pass and both transfer
  // funds before either committed -- a classic check-then-act race.
  return prisma.$transaction(async (tx) => {
    // Lock auction row first.
    const lockedAuction = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE
    `;
    if (lockedAuction.length === 0) throw createError('Auction not found', 404);

    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { seller: true },
    });
    if (!auction) throw createError('Auction not found', 404);
    if (auction.status !== AuctionStatus.ACTIVE) throw createError('Auction not active', 400);
    if (!auction.buyNowPrice) throw createError('No buy-now price set', 400);
    if (auction.sellerId === buyerId) throw createError("Can't buy your own auction", 403);

    // Lock both wallet rows in ascending userId order to maintain the global
    // lock-order invariant (auction first, then wallets sorted).
    for (const uid of [buyerId, auction.sellerId].sort()) {
      await tx.$queryRaw`SELECT id FROM wallets WHERE "userId" = ${uid} FOR UPDATE`;
    }

    const buyerWallet = await tx.wallet.findUnique({ where: { userId: buyerId } });
    if (!buyerWallet || buyerWallet.balance < auction.buyNowPrice) {
      throw createError('Insufficient wallet balance', 400);
    }

    // Deduct from buyer
    await tx.wallet.update({
      where: { userId: buyerId },
      data: { balance: { decrement: auction.buyNowPrice } },
    });

    // Credit to seller
    await tx.wallet.update({
      where: { userId: auction.sellerId },
      data: { balance: { increment: auction.buyNowPrice } },
    });

    const sellerWallet = await tx.wallet.findUnique({ where: { userId: auction.sellerId } });

    await tx.transaction.createMany({
      data: [
        {
          walletId: buyerWallet.id,
          userId: buyerId,
          type: 'PAYMENT',
          amount: -auction.buyNowPrice,
          description: `Buy Now: ${auction.title}`,
          referenceId: auctionId,
        },
        {
          walletId: sellerWallet!.id,
          userId: auction.sellerId,
          type: 'PAYMENT',
          amount: auction.buyNowPrice,
          description: `Sale: ${auction.title}`,
          referenceId: auctionId,
        },
      ],
    });

    // End auction with this buyer as winner
    return tx.auction.update({
      where: { id: auctionId },
      data: {
        status: AuctionStatus.ENDED,
        winnerId: buyerId,
        currentPrice: auction.buyNowPrice,
        actualEndTime: new Date(),
      },
    });
  });
};
