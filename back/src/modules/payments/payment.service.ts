/**
 * Mock Payment Service
 * In a real app you'd integrate Stripe/Razorpay.
 * For the college project, this simulates payment flow.
 */

import { SettlementKind } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { notifyUser } from '../notifications/notification.service';
import { D, toNum } from '../../lib/decimal';
import { settleWithinTx } from '../escrow/escrow.service';

export const confirmWinnerPayment = async (auctionId: string, winnerId: string) => {
  // Phase A2: All validation happens inside the tx with FOR UPDATE locks so two
  // simultaneous confirm calls can't both transfer funds.
  // Phase A5: idempotency now lives in the shared Settlement row (uniqued on
  // auctionId) instead of an ad-hoc "existing PAYMENT transaction" probe, and
  // the winner->seller transfer + ledger rows move into settleWithinTx, the
  // same path buyNow uses.
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

    // Idempotency early-out: if this auction already settled, return success
    // (not an error) so frontend retries are safe -- before re-deriving the
    // winning bid. settleWithinTx re-checks the same row under the wallet lock
    // as the authoritative guard against a concurrent settle.
    const existing = await tx.settlement.findUnique({ where: { auctionId } });
    if (existing) {
      return {
        message: 'Payment already confirmed',
        auctionId,
        amount: toNum(D(existing.amount)) ?? 0,
        alreadyProcessed: true,
      };
    }

    const winningBid = await tx.bid.findFirst({
      where: { auctionId, bidderId: winnerId, status: { in: ['WINNING', 'WON'] } },
      orderBy: { amount: 'desc' },
    });
    if (!winningBid) throw createError('Winning bid not found', 404);

    // WON_AUCTION: the funds were moved into the winner's heldAmount when the
    // bid was placed, so settleWithinTx releases heldAmount -> seller balance
    // (no fresh balance check) and writes the Settlement row.
    const { amount } = await settleWithinTx(tx, {
      auctionId,
      auctionTitle: auction.title,
      payerId: winnerId,
      sellerId: auction.sellerId,
      amount: winningBid.amount,
      kind: SettlementKind.WON_AUCTION,
    });

    await tx.bid.update({
      where: { id: winningBid.id },
      data: { status: 'WON' },
    });

    // notifyUser swallows its own errors; it's fine to call inside the tx. A
    // fuller fix pushes to the BullMQ notifications queue (Phase A7).
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
