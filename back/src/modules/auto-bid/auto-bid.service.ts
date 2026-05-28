import { AuctionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { placeBid } from '../bidding/bid.service';
import { notifyUser } from '../notifications/notification.service';
import { Server } from 'socket.io';
import { D, toNum, serializeMoney } from '../../lib/decimal';

/**
 * Set or update an auto-bid for an auction.
 */
export const setAutoBid = async (data: {
  auctionId: string;
  bidderId: string;
  maxAmount: number;
}) => {
  const { auctionId, bidderId, maxAmount } = data;

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw createError('Auction not found', 404);
  if (auction.status !== AuctionStatus.ACTIVE) throw createError('Auction not active', 400);
  if (auction.sellerId === bidderId) throw createError("Can't auto-bid on your own auction", 403);
  // Auto-bid is meaningless for sealed bids: the engine relies on a moving
  // `currentPrice + minIncrement` ladder, but Phase A4 fixed `placeBid` to
  // keep `currentPrice` constant for SEALED_BID auctions (it would otherwise
  // leak the latest bid). With currentPrice constant, an auto-bid would
  // either no-op or fire wrong. Block at the validation layer instead of
  // silently misbehaving.
  if (auction.type === 'SEALED_BID') {
    throw createError('Auto-bid is not supported on sealed-bid auctions', 400);
  }
  // Phase A1: Decimal-safe comparisons against auction.currentPrice / reservePrice.
  const maxD = D(maxAmount);
  const currentD = D(auction.currentPrice);
  // Dutch auto-accept: target price must be BELOW current (price drops toward it)
  // English auto-bid: max amount must be ABOVE current (bids go up toward it)
  if (auction.type === 'DUTCH') {
    if (maxD.gte(currentD)) {
      throw createError(
        `Auto-accept price must be lower than current price ₹${currentD.toString()}`,
        400,
      );
    }
    if (auction.reservePrice && maxD.lt(auction.reservePrice)) {
      throw createError(
        `Auto-accept price cannot be below reserve price ₹${D(auction.reservePrice).toString()}`,
        400,
      );
    }
  } else {
    if (maxD.lte(currentD)) {
      throw createError(
        `Max amount must be greater than current price ₹${currentD.toString()}`,
        400,
      );
    }
  }

  // Check wallet can cover the bid
  const minBid =
    auction.type === 'DUTCH' ? maxD : currentD.add(auction.minIncrement);
  const wallet = await prisma.wallet.findUnique({ where: { userId: bidderId } });
  if (!wallet || D(wallet.balance).sub(wallet.heldAmount).lt(minBid)) {
    throw createError('Insufficient available balance for auto-bid', 400);
  }

  const autoBid = await prisma.autoBid.upsert({
    where: { auctionId_bidderId: { auctionId, bidderId } },
    update: { maxAmount: maxD, isActive: true },
    create: { auctionId, bidderId, maxAmount: maxD },
  });

  return serializeMoney(autoBid);
};

export const cancelAutoBid = async (auctionId: string, bidderId: string) => {
  const result = await prisma.autoBid.updateMany({
    where: { auctionId, bidderId },
    data: { isActive: false },
  });

  if (result.count === 0) {
    // No record at all — still return success, frontend just needs it gone
    return { message: 'Auto-bid not found or already inactive' };
  }

  return { message: 'Auto-bid cancelled' };
};

/**
 * Core auto-bid processor.
 * Called after any manual bid is placed.
 * Finds the highest willing auto-bidder and places a counter-bid.
 */
export const processAutoBids = async (
  auctionId: string,
  currentWinnerId: string,
  currentPrice: number,
  io?: Server
) => {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction || auction.status !== AuctionStatus.ACTIVE) return;

  // Get all active auto-bids for this auction, excluding current winner
  // Sort by maxAmount DESC — highest willing bidder gets priority
  const autoBids = await prisma.autoBid.findMany({
    where: {
      auctionId,
      isActive: true,
      bidderId: { not: currentWinnerId },
    },
    orderBy: { maxAmount: 'desc' },
  });

  if (autoBids.length === 0) return;

  const topAutoBid = autoBids[0];
  // Phase A1: Decimal-safe ladder math.
  const nextBidAmountD = D(currentPrice).add(auction.minIncrement);

  if (D(topAutoBid.maxAmount).lt(nextBidAmountD)) {
    // All auto-bids are priced out — deactivate them all so they don't
    // confuse users into thinking they're still protected.
    await prisma.autoBid.updateMany({
      where: {
        auctionId,
        isActive: true,
        maxAmount: { lt: nextBidAmountD },
      },
      data: { isActive: false },
    });
    return;
  }

  // Determine the actual bid amount:
  // If there's a 2nd auto-bidder, we bid just enough to beat them + 1 increment
  // Otherwise we bid the minimum to win
  let bidAmountD = nextBidAmountD;

  if (autoBids.length > 1) {
    const secondBid = autoBids[1];
    const beatingAmount = D(secondBid.maxAmount).add(auction.minIncrement);
    // min(beatingAmount, topAutoBid.maxAmount)
    bidAmountD = beatingAmount.lt(topAutoBid.maxAmount) ? beatingAmount : D(topAutoBid.maxAmount);
  }

  // placeBid accepts a number. Convert Decimal -> number here. Money values
  // stay within safe-integer * 100 territory so toNum is precision-preserving.
  const bidAmountNum = toNum(bidAmountD) ?? 0;

  try {
    const bid = await placeBid({
      auctionId,
      bidderId: topAutoBid.bidderId,
      amount: bidAmountNum,
      isAutoBid: true,
    });

    // Update auto-bid current amount
    await prisma.autoBid.update({
      where: { id: topAutoBid.id },
      data: { currentBid: bidAmountD },
    });

    // Emit to socket room. bid.amount comes back as number from placeBid().
    if (io) {
      io.to(`auction:${auctionId}`).emit('bid:new', {
        bid: {
          id: bid.id,
          amount: bid.amount,
          bidderId: bid.bidderId,
          isAutoBid: true,
          createdAt: bid.createdAt,
        },
      });
    }

    // Notify the auto-bidder
    notifyUser(topAutoBid.bidderId, {
      type: 'AUTO_BID_PLACED',
      title: 'Auto-bid placed',
      message: `Auto-bid of ${bidAmountNum} placed on "${auction.title}"`,
      data: { auctionId, amount: bidAmountNum },
    });

    // Recursively process if the previous winner also has an auto-bid
    await processAutoBids(auctionId, topAutoBid.bidderId, bidAmountNum, io);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'statusCode' in err &&
      'message' in err &&
      err.statusCode === 400 &&
      typeof err.message === 'string' &&
      err.message.includes('balance')
    ) {
      // Deactivate auto-bid if can't afford
      await prisma.autoBid.update({
        where: { id: topAutoBid.id },
        data: { isActive: false },
      });
    }
  }
};

export const getMyAutoBid = async (auctionId: string, bidderId: string) => {
  const autoBid = await prisma.autoBid.findUnique({
    where: { auctionId_bidderId: { auctionId, bidderId } },
  });
  if (autoBid && !autoBid.isActive) return null;
  return serializeMoney(autoBid);
};
