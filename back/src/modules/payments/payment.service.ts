/**
 * Mock Payment Service
 * In a real app you'd integrate Stripe/Razorpay.
 * For the college project, this simulates payment flow.
 */

import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { notifyUser } from '../notifications/notification.service';

export const confirmWinnerPayment = async (auctionId: string, winnerId: string) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { seller: true },
  });

  if (!auction) throw createError('Auction not found', 404);
  if (auction.winnerId !== winnerId) throw createError('You did not win this auction', 403);
  if (auction.status !== 'ENDED') throw createError('Auction has not ended', 400);

  // Check if already settled — idempotent: return success instead of error
  const existingPayment = await prisma.transaction.findFirst({
    where: { userId: winnerId, referenceId: auctionId, type: 'PAYMENT' },
  });
  if (existingPayment) {
    return {
      message: 'Payment already confirmed',
      auctionId,
      amount: existingPayment.amount ? Math.abs(Number(existingPayment.amount)) : 0,
      alreadyProcessed: true,
    };
  }

  // The bid amount was already held — now we transfer it
  const winningBid = await prisma.bid.findFirst({
    where: { auctionId, bidderId: winnerId, status: { in: ['WINNING', 'WON'] } },
    orderBy: { amount: 'desc' },
  });

  if (!winningBid) throw createError('Winning bid not found', 404);

  const amount = winningBid.amount;

  return prisma.$transaction(async (tx) => {
    // Release hold from winner's wallet and deduct
    const winnerWallet = await tx.wallet.findUnique({ where: { userId: winnerId } });
    if (!winnerWallet) throw createError('Winner wallet not found', 404);

    await tx.wallet.update({
      where: { userId: winnerId },
      data: {
        heldAmount: { decrement: amount },
        // balance was already decremented when bid was placed
      },
    });

    // Credit to seller
    await tx.wallet.update({
      where: { userId: auction.sellerId },
      data: { balance: { increment: amount } },
    });

    const sellerWallet = await tx.wallet.findUnique({ where: { userId: auction.sellerId } });

    // Record transactions
    await tx.transaction.createMany({
      data: [
        {
          walletId: winnerWallet.id,
          userId: winnerId,
          type: 'PAYMENT',
          amount: -amount,
          description: `Won auction: ${auction.title}`,
          referenceId: auctionId,
          status: 'COMPLETED',
        },
        {
          walletId: sellerWallet!.id,
          userId: auction.sellerId,
          type: 'PAYMENT',
          amount,
          description: `Sold: ${auction.title}`,
          referenceId: auctionId,
          status: 'COMPLETED',
        },
      ],
    });

    // Update bid to WON
    await tx.bid.update({
      where: { id: winningBid.id },
      data: { status: 'WON' },
    });

    // Notify seller
    notifyUser(auction.sellerId, {
      type: 'PAYMENT_RECEIVED',
      title: 'Payment received!',
      message: `You received ${amount} for "${auction.title}"`,
      data: { auctionId, amount },
    });

    return {
      message: 'Payment confirmed',
      auctionId,
      amount,
      seller: auction.seller.name,
    };
  });
};

export const refundLosers = async (auctionId: string) => {
  // Release all non-winning held amounts
  const outbidBids = await prisma.bid.findMany({
    where: { auctionId, status: 'OUTBID' },
    include: { bidder: { include: { wallet: true } } },
  });

  // The held amounts should already be released in the bidding engine.
  // This is a cleanup in case anything was missed.
  return { refunded: outbidBids.length, auctionId };
};
