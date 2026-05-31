import { AuctionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { autoBidQueue } from '../../queues/auction.queue';
import { D, serializeMoney } from '../../lib/decimal';

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

  // Phase E2: require enough available balance to cover the FULL maxAmount,
  // not just the next increment.
  //
  // The old check passed any wallet that could cover one minIncrement above
  // current price; a $0-balance user could register a $10,000 auto-bid and
  // discover it silently deactivated later by the ladder's affordability
  // probe. That UX is bad two ways: the user thinks they have a $10k auto-bid
  // running, and the bidder log on the auction page suddenly shows no auto-bid
  // activity with no error surfaced.
  //
  // We now require `available >= maxAmount` at registration. The cost: a user
  // who funds their wallet later but auto-bids early will get rejected. The
  // benefit: every accepted auto-bid is honoured; the ladder's per-step
  // affordability probe in `processAutoBidLadder` becomes a defence-in-depth
  // check rather than the primary gate.
  const wallet = await prisma.wallet.findUnique({ where: { userId: bidderId } });
  if (!wallet) {
    throw createError('Wallet not found', 400);
  }
  const available = D(wallet.balance).sub(wallet.heldAmount);
  if (available.lt(maxD)) {
    throw createError(
      `Insufficient available balance for auto-bid. ` +
        `Need ₹${maxD.toString()}, have ₹${available.toString()} available.`,
      400,
    );
  }

  const autoBid = await prisma.autoBid.upsert({
    where: { auctionId_bidderId: { auctionId, bidderId } },
    update: { maxAmount: maxD, isActive: true },
    create: { auctionId, bidderId, maxAmount: maxD },
  });

  // Phase A6 follow-up: a freshly-armed (or raised) auto-bid that sits above
  // the current price should immediately start laddering, not wait for the
  // next manual bid. Enqueue the ladder; the worker filters by
  // `bidderId != triggerBidderId`, so passing this bidder as the "trigger"
  // means the worker excludes them and lets the other auto-bidders compete.
  // English only -- setAutoBid already rejects SEALED_BID and the worker
  // short-circuits on Dutch.
  if (auction.type === 'ENGLISH') {
    autoBidQueue
      .add('process-ladder', { auctionId, triggerBidderId: bidderId })
      .catch((e) => {
        console.error('Failed to enqueue auto-bid ladder from setAutoBid:', e);
      });
  }

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

// Phase A6: the old recursive `processAutoBids` lived here. It called placeBid,
// which opened a NESTED prisma.$transaction inside the parent placeBid tx --
// Prisma does not support that. It also breached the UX contract by jumping
// straight to `min(beatingAmount, top.maxAmount)` instead of writing every
// ladder rung as its own Bid row. Both issues are gone: the producer is now
// `bid.service.placeBid` enqueueing onto autoBidQueue after its tx commits,
// and the consumer is `back/src/workers/index.ts::processAutoBidLadder`.

export const getMyAutoBid = async (auctionId: string, bidderId: string) => {
  const autoBid = await prisma.autoBid.findUnique({
    where: { auctionId_bidderId: { auctionId, bidderId } },
  });
  if (autoBid && !autoBid.isActive) return null;
  return serializeMoney(autoBid);
};
