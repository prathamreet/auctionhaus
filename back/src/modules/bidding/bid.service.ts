import { AuctionStatus, AuctionType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { notifyUser } from '../notifications/notification.service';
import { processAutoBids } from '../auto-bid/auto-bid.service';
import { io } from '../../index';

/**
 * Place a bid on an auction.
 * Handles English, Dutch, and Sealed bid logic.
 * Triggers auto-bid engine if others have auto-bids set.
 */
export const placeBid = async (data: {
  auctionId: string;
  bidderId: string;
  amount: number;
  isAutoBid?: boolean;
}) => {
  const { auctionId, bidderId, amount, isAutoBid = false } = data;

  return prisma.$transaction(async (tx) => {
    // ── 1. Fetch and validate auction ──
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw createError('Auction not found', 404);
    if (auction.status !== AuctionStatus.ACTIVE) throw createError('Auction is not active', 400);
    if (auction.sellerId === bidderId) throw createError("Can't bid on your own auction", 403);

    const now = new Date();
    if (now > auction.endTime) throw createError('Auction has ended', 400);

    // ── 2. Type-specific bid validation ──
    if (auction.type === AuctionType.ENGLISH) {
      const minBid = auction.currentPrice + auction.minIncrement;
      if (amount < minBid) {
        throw createError(`Minimum bid is ${minBid}`, 400);
      }
    } else if (auction.type === AuctionType.DUTCH) {
      // Dutch: accept current price, no going higher
      if (amount !== auction.currentPrice) {
        throw createError(`Dutch auction bid must be exactly ${auction.currentPrice}`, 400);
      }
    } else if (auction.type === AuctionType.SEALED_BID) {
      // Sealed: any amount above starting price, bids hidden
      if (amount <= auction.startingPrice) {
        throw createError(`Bid must be above starting price ${auction.startingPrice}`, 400);
      }
    }

    // ── 3. Wallet check ──
    const wallet = await tx.wallet.findUnique({ where: { userId: bidderId } });
    if (!wallet || (wallet.balance - wallet.heldAmount) < amount) {
      throw createError('Insufficient available balance', 400);
    }

    // ── 4. Release hold from previous winning bid (if English) ──
    if (auction.type === AuctionType.ENGLISH) {
      const previousWinning = await tx.bid.findFirst({
        where: { auctionId, status: 'WINNING' },
        include: { bidder: { include: { wallet: true } } },
      });

      if (previousWinning && previousWinning.bidderId !== bidderId) {
        // Outbid: release their hold, mark as OUTBID
        await tx.bid.update({ where: { id: previousWinning.id }, data: { status: 'OUTBID' } });
        await tx.wallet.update({
          where: { id: previousWinning.bidder.wallet!.id },
          data: {
            balance: { increment: previousWinning.amount },
            heldAmount: { decrement: previousWinning.amount },
          },
        });
        // Record BID_RELEASE transaction
        await tx.transaction.create({
          data: {
            walletId: previousWinning.bidder.wallet!.id,
            userId: previousWinning.bidderId,
            type: 'BID_RELEASE',
            amount: previousWinning.amount,
            description: `Outbid on "${auction.title}"`,
            referenceId: auctionId,
          },
        });

        // Notify outbid
        notifyUser(previousWinning.bidderId, {
          type: 'OUTBID',
          title: 'You were outbid!',
          message: `Your bid on "${auction.title}" was outbid. New price: ${amount}`,
          data: { auctionId, newPrice: amount },
        });
      } else if (previousWinning && previousWinning.bidderId === bidderId) {
        // Same bidder increasing their bid: release old hold first
        await tx.bid.update({ where: { id: previousWinning.id }, data: { status: 'OUTBID' } });
        await tx.wallet.update({
          where: { id: previousWinning.bidder.wallet!.id },
          data: {
            balance: { increment: previousWinning.amount },
            heldAmount: { decrement: previousWinning.amount },
          },
        });
        // Record BID_RELEASE transaction
        await tx.transaction.create({
          data: {
            walletId: previousWinning.bidder.wallet!.id,
            userId: previousWinning.bidderId,
            type: 'BID_RELEASE',
            amount: previousWinning.amount,
            description: `Increased bid on "${auction.title}"`,
            referenceId: auctionId,
          },
        });
      }
    }

    // ── 5. Hold bid amount in wallet ──
    const updatedWallet = await tx.wallet.update({
      where: { userId: bidderId },
      data: {
        balance: { decrement: amount },
        heldAmount: { increment: amount },
      },
    });
    // Record BID_HOLD transaction
    await tx.transaction.create({
      data: {
        walletId: updatedWallet.id,
        userId: bidderId,
        type: 'BID_HOLD',
        amount: -amount,
        description: `Bid on "${auction.title}"`,
        referenceId: auctionId,
      },
    });

    // ── 6. Create bid record ──
    const bid = await tx.bid.create({
      data: {
        auctionId,
        bidderId,
        amount,
        status: 'WINNING',
        isAutoBid,
      },
    });

    // ── 7. Update auction current price ──
    const auctionUpdateData: Prisma.AuctionUncheckedUpdateInput = { currentPrice: amount };

    // Anti-sniping: extend end time if bid in last N minutes
    if (auction.type === AuctionType.ENGLISH && auction.antiSnipingMins > 0) {
      const endTime = new Date(auction.endTime);
      const cutoff = new Date(endTime.getTime() - auction.antiSnipingMins * 60 * 1000);
      if (now >= cutoff) {
        const newEndTime = new Date(now.getTime() + auction.antiSnipingMins * 60 * 1000);
        auctionUpdateData.endTime = newEndTime;
        auctionUpdateData.actualEndTime = newEndTime;

        io.to(`auction:${auctionId}`).emit('auction:extended', {
          auctionId,
          newEndTime,
          reason: 'anti_sniping',
        });
      }
    }

    // Dutch auction: accept first bid = end auction
    if (auction.type === AuctionType.DUTCH) {
      auctionUpdateData.status = AuctionStatus.ENDED;
      auctionUpdateData.winnerId = bidderId;
      auctionUpdateData.winnerBidId = bid.id;
      auctionUpdateData.actualEndTime = now;
    }

    await tx.auction.update({ where: { id: auctionId }, data: auctionUpdateData });

    // ── 8. Process Auto-bids ──
    // We do this after the transaction is committed to avoid holding locks
    // but we can also do it inside if needed. Actually doing it outside is safer.
    // However, placeBid returns the bid, so we might want to trigger it asynchronously.
    setImmediate(() => {
      processAutoBids(auctionId, bidderId, amount, io).catch((e) => {
        console.error('Failed to process auto-bids:', e);
      });
    });

    return bid;
  });
};

export const getAuctionBids = async (auctionId: string, _type?: string) => {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw createError('Auction not found', 404);

  // For sealed bid, hide bidder identities until ended
  const isSealed = auction.type === AuctionType.SEALED_BID && auction.status === AuctionStatus.ACTIVE;

  const bids = await prisma.bid.findMany({
    where: { auctionId },
    orderBy: { amount: 'desc' },
    include: {
      bidder: isSealed
        ? { select: { id: true, name: false } }
        : { select: { id: true, name: true, avatar: true } },
    },
  });

  return bids;
};
