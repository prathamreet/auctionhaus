import { AuctionStatus, AuctionType, Prisma, SettlementKind } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { notifyUser } from '../notifications/notification.service';
import { autoBidQueue } from '../../queues/auction.queue';
import { io } from '../../index';
import { D, neg, toNum } from '../../lib/decimal';
import { FraudEngine } from '../fraud/fraud.engine';
import { settleWithinTx } from '../escrow/escrow.service';

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
  // Phase A1: lock the JS-number input behind a Decimal so every comparison /
  // write below is exact. `amount` (the function param) stays in scope for
  // socket emits / return values that should be plain numbers.
  const amountD = D(amount);

  const bid = await prisma.$transaction(async (tx) => {
    // ── 0. Pessimistic locks (Phase A2) ──
    // Acquire the auction row lock FIRST, then wallet rows in ascending
    // userId order. Deadlocks are impossible as long as every code path
    // (bid, buyNow, endAuction, payment, withdraw) follows this order.
    //
    // Why: under default READ COMMITTED, two concurrent bids both `findUnique`
    // the auction, both see the same `currentPrice`, and both pass the
    // `amount >= currentPrice + minIncrement` check. With FOR UPDATE the
    // second waits until the first commits, so the second re-reads the
    // updated currentPrice and is forced to fail validation.
    const lockedAuction = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE
    `;
    if (lockedAuction.length === 0) throw createError('Auction not found', 404);

    // ── 1. Fetch and validate auction ──
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw createError('Auction not found', 404);
    if (auction.status !== AuctionStatus.ACTIVE) throw createError('Auction is not active', 400);
    if (auction.sellerId === bidderId) throw createError("Can't bid on your own auction", 403);

    const now = new Date();
    if (now > auction.endTime) throw createError('Auction has ended', 400);

    // ── 2. Type-specific bid validation (Phase A1: Decimal compare) ──
    if (auction.type === AuctionType.ENGLISH) {
      const minBid = D(auction.currentPrice).add(auction.minIncrement);
      if (amountD.lt(minBid)) {
        throw createError(`Minimum bid is ${minBid.toString()}`, 400);
      }
    } else if (auction.type === AuctionType.DUTCH) {
      // Dutch: accept current price, no going higher
      if (!amountD.eq(auction.currentPrice)) {
        throw createError(
          `Dutch auction bid must be exactly ${D(auction.currentPrice).toString()}`,
          400,
        );
      }
    } else if (auction.type === AuctionType.SEALED_BID) {
      // Sealed: any amount above starting price, bids hidden
      if (amountD.lte(auction.startingPrice)) {
        throw createError(
          `Bid must be above starting price ${D(auction.startingPrice).toString()}`,
          400,
        );
      }
    }

    // ── 3. Lock the bidder's wallet, plus the previous winner's wallet if
    // we are going to release their hold (English only). Lock in ascending
    // userId order to maintain the global lock order.
    let previousWinnerId: string | null = null;
    if (auction.type === AuctionType.ENGLISH) {
      const prev = await tx.bid.findFirst({
        where: { auctionId, status: 'WINNING' },
        select: { bidderId: true },
      });
      if (prev && prev.bidderId !== bidderId) previousWinnerId = prev.bidderId;
    }
    const walletUserIds = previousWinnerId
      ? [bidderId, previousWinnerId].sort()
      : [bidderId];
    for (const uid of walletUserIds) {
      await tx.$queryRaw`SELECT id FROM wallets WHERE "userId" = ${uid} FOR UPDATE`;
    }

    // ── 4. Wallet check (now reading the locked row) ──
    const wallet = await tx.wallet.findUnique({ where: { userId: bidderId } });
    if (!wallet) throw createError('Insufficient available balance', 400);
    const available = D(wallet.balance).sub(wallet.heldAmount);
    if (available.lt(amountD)) {
      throw createError('Insufficient available balance', 400);
    }

    // ── 5. Release hold from previous winning bid (if English) ──
    if (auction.type === AuctionType.ENGLISH) {
      const previousWinning = await tx.bid.findFirst({
        where: { auctionId, status: 'WINNING' },
        include: { bidder: { include: { wallet: true } } },
      });

      if (previousWinning && previousWinning.bidderId !== bidderId) {
        // Outbid: release their hold, mark as OUTBID. previousWinning.amount
        // is Decimal -- Prisma increment/decrement and the transaction log
        // accept it directly.
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

    // ── 5. Hold bid amount in wallet (Decimal-safe) ──
    const updatedWallet = await tx.wallet.update({
      where: { userId: bidderId },
      data: {
        balance: { decrement: amountD },
        heldAmount: { increment: amountD },
      },
    });
    // Record BID_HOLD transaction. Negative amount = debit -- use neg() so we
    // don't fall back to JS `-` which would coerce Decimal to number.
    await tx.transaction.create({
      data: {
        walletId: updatedWallet.id,
        userId: bidderId,
        type: 'BID_HOLD',
        amount: neg(amountD),
        description: `Bid on "${auction.title}"`,
        referenceId: auctionId,
      },
    });

    // ── 6. Create bid record ──
    const bid = await tx.bid.create({
      data: {
        auctionId,
        bidderId,
        amount: amountD,
        status: 'WINNING',
        isAutoBid,
      },
    });

    // ── 7. Update auction current price ──
    // SEALED_BID: currentPrice must NOT change. Updating it would (a) leak the
    // most-recent bid amount via every API response that returns the auction
    // and the auction:state socket emit, and (b) is semantically wrong —
    // sealed bids have no public current price. Leave at startingPrice.
    const auctionUpdateData: Prisma.AuctionUncheckedUpdateInput =
      auction.type === AuctionType.SEALED_BID ? {} : { currentPrice: amountD };

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

    // Only fire the update if we actually have a field change. For sealed
    // bids with no anti-sniping path, auctionUpdateData stays empty.
    if (Object.keys(auctionUpdateData).length > 0) {
      await tx.auction.update({ where: { id: auctionId }, data: auctionUpdateData });
    }

    // Dutch settles on accept. A Dutch bid both wins and ends the auction in
    // this same transaction, so the seller is paid immediately rather than
    // waiting for the end-auction job. settleWithinTx releases the funds we
    // just held (heldAmount -> seller balance) and writes the idempotent
    // Settlement row, so the later end-auction job is a no-op for this auction.
    // The auction row is already FOR UPDATE locked above, satisfying the
    // settleWithinTx lock-order precondition.
    if (auction.type === AuctionType.DUTCH) {
      await settleWithinTx(tx, {
        auctionId,
        auctionTitle: auction.title,
        payerId: bidderId,
        sellerId: auction.sellerId,
        amount: amountD,
        kind: SettlementKind.WON_AUCTION,
      });
      await tx.bid.update({ where: { id: bid.id }, data: { status: 'WON' } });
    }

    // Return a number-typed amount so callers (controller, socket emit, the
    // frontend) see the same shape as before A1. The Decimal lives only
    // inside this function.
    return { ...bid, amount: toNum(bid.amount) ?? amount };
  });

  // ── Phase C2/C3: feed the fraud engine AFTER the tx commits. Fire-and-forget
  // so a detector error never breaks the bid response. The engine adds the bid
  // to its sliding-window graph, extracts 5 features, scores, and emits
  // fraud:flag to the admin room if score >= SCORE_THRESHOLD.
  void (async () => {
    try {
      const auctionMeta = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: {
          title: true,
          sellerId: true,
          minIncrement: true,
          seller: { select: { name: true } },
        },
      });
      const bidder = await prisma.user.findUnique({
        where: { id: bidderId },
        select: { name: true },
      });
      if (auctionMeta && bidder) {
        await FraudEngine.getInstance().onBid({
          bidId: bid.id,
          auctionId,
          bidderId,
          bidderName: bidder.name,
          sellerId: auctionMeta.sellerId,
          auctionTitle: auctionMeta.title,
          amount,
          minIncrement: toNum(auctionMeta.minIncrement) ?? 1,
          ts: Date.now(),
          isAutoBid,
        });
      }
    } catch { /* detector must not affect bid result */ }
  })();

  // ── Phase A6: enqueue the auto-bid ladder AFTER the manual bid's tx commits.
  // Enqueueing inside the tx would queue a phantom job if the tx then rolls
  // back. The worker (back/src/workers/index.ts::processAutoBidLadder) re-locks
  // the auction and walks every active auto-bid one increment at a time,
  // writing each step as a Bid row so the bid history page renders the ladder.
  // The trigger bidder is passed so the worker knows whose auto-bid (if any)
  // NOT to challenge.
  //
  // Dutch and Sealed auctions never ladder; the worker filters them out, so
  // enqueueing is a no-op for those. Cheaper than re-fetching auction.type
  // here just to skip.
  autoBidQueue
    .add('process-ladder', { auctionId, triggerBidderId: bidderId })
    .catch((e) => {
      console.error('Failed to enqueue auto-bid ladder:', e);
    });

  return bid;
};

/**
 * Return the bid list for an auction.
 *
 * Sealed-bid privacy contract:
 *   While a SEALED_BID auction is ACTIVE, no caller may learn:
 *     - other bidders' identities (id, name, avatar)
 *     - other bidders' bid amounts (would reveal ranking)
 *     - the rank-ordering of bids (must be insertion order, not amount-sorted)
 *   The viewer is allowed to see their OWN bid in full so the UI can show "your bid".
 *   When the auction status becomes ENDED, full bid data is returned.
 *
 * The previous implementation passed `bidder: { select: { id: true, name: false } }`
 * which is a no-op in Prisma (you can't turn a field off via select=false), so it
 * silently leaked bidder names AND ranked them by amount. Fixed here.
 */
export const getAuctionBids = async (auctionId: string, viewerId: string) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { id: true, type: true, status: true },
  });
  if (!auction) throw createError('Auction not found', 404);

  const isSealedLive =
    auction.type === AuctionType.SEALED_BID &&
    auction.status === AuctionStatus.ACTIVE;

  if (isSealedLive) {
    // Order by createdAt so the response is stable but reveals no ranking.
    const rawBids = await prisma.bid.findMany({
      where: { auctionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        auctionId: true,
        bidderId: true,
        amount: true,
        status: true,
        isAutoBid: true,
        createdAt: true,
      },
    });

    return rawBids.map((b) => {
      const isOwn = b.bidderId === viewerId;
      return {
        id: b.id,
        auctionId: b.auctionId,
        status: b.status,
        isAutoBid: b.isAutoBid,
        createdAt: b.createdAt,
        // Mask everything that could leak ranking or identity.
        // The viewer's own bid is returned in full so the UI can render it.
        // Decimal -> number at the boundary (Phase A1).
        amount: isOwn ? toNum(b.amount) : null,
        bidderId: isOwn ? b.bidderId : null,
        bidder: isOwn ? { id: b.bidderId } : null,
      };
    });
  }

  // English/Dutch, or sealed auctions that have ENDED: return full data.
  const bids = await prisma.bid.findMany({
    where: { auctionId },
    orderBy: { amount: 'desc' },
    include: {
      bidder: { select: { id: true, name: true, avatar: true } },
    },
  });
  // Phase A1: serialize Decimal amounts to number so the API surface stays
  // number-typed for the frontend.
  return bids.map((b) => ({ ...b, amount: toNum(b.amount) }));
};
