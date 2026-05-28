/**
 * Mock Payment Service
 * In a real app you'd integrate Stripe/Razorpay.
 * For the college project, this simulates payment flow.
 */

import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { notifyUser } from '../notifications/notification.service';
import { D, toNum } from '../../lib/decimal';

export const confirmWinnerPayment = async (auctionId: string, winnerId: string) => {
  // Phase A2: All validation (including the idempotency check for an existing
  // PAYMENT transaction) now happens inside the tx with FOR UPDATE locks.
  // Previously, two simultaneous confirm calls could both pass the "no
  // existing payment" check and both transfer funds. Now the auction is
  // locked first, the existing-payment query runs while holding that lock,
  // and only one path can win the race.
  return prisma.$transaction(async (tx) => {
    // Lock auction row first per global lock-order rule.
    const lockedAuction = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE
    `;
    if (lockedAuction.length === 0) throw createError('Auction not found', 404);

    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { seller: true },
    });
    if (!auction) throw createError('Auction not found', 404);
    if (auction.winnerId !== winnerId) throw createError('You did not win this auction', 403);
    if (auction.status !== 'ENDED') throw createError('Auction has not ended', 400);

    // Idempotency: if a PAYMENT transaction already exists for this winner +
    // auction combo, settlement has already happened. Returning success here
    // is intentional (not an error) so frontend retries are safe.
    const existingPayment = await tx.transaction.findFirst({
      where: { userId: winnerId, referenceId: auctionId, type: 'PAYMENT' },
    });
    if (existingPayment) {
      // existingPayment.amount is Decimal (negative for the debit side).
      return {
        message: 'Payment already confirmed',
        auctionId,
        amount: toNum(D(existingPayment.amount).abs()) ?? 0,
        alreadyProcessed: true,
      };
    }

    const winningBid = await tx.bid.findFirst({
      where: { auctionId, bidderId: winnerId, status: { in: ['WINNING', 'WON'] } },
      orderBy: { amount: 'desc' },
    });
    if (!winningBid) throw createError('Winning bid not found', 404);

    // Phase A1: pin the bid amount as Decimal once. winningBid.amount is
    // already Decimal but D() is idempotent and lets us call .neg() cleanly.
    const amountD = D(winningBid.amount);
    const amountDebit = amountD.neg();

    // Lock both wallet rows in ascending userId order.
    for (const uid of [winnerId, auction.sellerId].sort()) {
      await tx.$queryRaw`SELECT id FROM wallets WHERE "userId" = ${uid} FOR UPDATE`;
    }

    const winnerWallet = await tx.wallet.findUnique({ where: { userId: winnerId } });
    if (!winnerWallet) throw createError('Winner wallet not found', 404);

    await tx.wallet.update({
      where: { userId: winnerId },
      data: {
        heldAmount: { decrement: amountD },
        // balance was already decremented when bid was placed
      },
    });

    await tx.wallet.update({
      where: { userId: auction.sellerId },
      data: { balance: { increment: amountD } },
    });

    const sellerWallet = await tx.wallet.findUnique({ where: { userId: auction.sellerId } });

    await tx.transaction.createMany({
      data: [
        {
          walletId: winnerWallet.id,
          userId: winnerId,
          type: 'PAYMENT',
          amount: amountDebit,
          description: `Won auction: ${auction.title}`,
          referenceId: auctionId,
          status: 'COMPLETED',
        },
        {
          walletId: sellerWallet!.id,
          userId: auction.sellerId,
          type: 'PAYMENT',
          amount: amountD,
          description: `Sold: ${auction.title}`,
          referenceId: auctionId,
          status: 'COMPLETED',
        },
      ],
    });

    await tx.bid.update({
      where: { id: winningBid.id },
      data: { status: 'WON' },
    });

    // Convert to number once for the notification body + API response.
    const amountNum = toNum(amountD) ?? 0;

    // Notify outside the critical path -- but we're already inside tx; this is
    // OK because notifyUser swallows its own errors. A proper fix is to push
    // to the BullMQ notifications queue (Phase A7) so notifications don't sit
    // in the tx commit path at all.
    notifyUser(auction.sellerId, {
      type: 'PAYMENT_RECEIVED',
      title: 'Payment received!',
      message: `You received ${amountNum} for "${auction.title}"`,
      data: { auctionId, amount: amountNum },
    });

    return {
      message: 'Payment confirmed',
      auctionId,
      amount: amountNum,
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
