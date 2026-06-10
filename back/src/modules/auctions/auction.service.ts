import { AuctionStatus, AuctionType, Prisma, SettlementKind } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { auctionQueue, dutchAuctionQueue } from '../../queues/auction.queue';
import { D, serializeMoney } from '../../lib/decimal';
import { settleWithinTx } from '../escrow/escrow.service';

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
  } else if (auction.type === AuctionType.DUTCH && auction.dutchInterval && auction.dutchPriceStep) {
    // If Dutch auction starts immediately, schedule the price-drop repeatable job directly
    await dutchAuctionQueue.add(
      'drop-price',
      { auctionId: auction.id, step: auction.dutchPriceStep },
      { repeat: { every: auction.dutchInterval * 1000, jobId: auction.id } }
    );
  }

  if (endDelay > 0) {
    await auctionQueue.add('end-auction', { auctionId: auction.id }, { delay: endDelay });
  }

  return serializeMoney(auction);
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
    // Phase A3: full-text search via the GIN tsvector index created in
    // 20260528000001_perf_indexes (to_tsvector('english', title || ' ' ||
    // description)). The old ILIKE `contains` did a sequential scan and the
    // GIN index couldn't help it. We tokenise the query, append the `:*`
    // prefix operator to each term (so "rol" still matches "rolex") and AND
    // them together. Only the FTS match runs in raw SQL; the status/type
    // filters, pagination, includes and Decimal->number serialization stay in
    // the Prisma query below by feeding the matched ids back through `where`.
    const terms = search
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);

    if (terms.length === 0) {
      // Query was all punctuation/whitespace -- no usable tokens. Empty page.
      return { auctions: [], total: 0, page, limit, totalPages: 0 };
    }

    // The tsquery string is built only from [a-z0-9] tokens we control, so it
    // can't carry tsquery operators; it is also passed as a bound parameter
    // (never string-concatenated into SQL), so there is no injection surface.
    const tsquery = terms.map((t) => `${t}:*`).join(' & ');
    const matches = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM auctions
      WHERE to_tsvector('english', title || ' ' || description) @@ to_tsquery('english', ${tsquery})
    `;
    where.id = { in: matches.map((m) => m.id) };
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

  return {
    auctions: serializeMoney(auctions),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
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

  // Phase A1: serializeMoney recursively converts every Decimal
  // (startingPrice, currentPrice, reservePrice, buyNowPrice, dutchPriceStep,
  // minIncrement, embedded bids[].amount, autoBid.maxAmount) -> number so
  // the frontend type contract stays `number`.
  return serializeMoney({ ...auction, isWatched, autoBid });
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

  const updated = await prisma.auction.update({ where: { id: auctionId }, data });
  return serializeMoney(updated);
};

export const cancelAuction = async (auctionId: string, userId: string, isAdmin = false) => {
  const result = await prisma.$transaction(async (tx) => {
    // ── 1. Lock auction row first ──
    const lockedAuction = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE
    `;
    if (lockedAuction.length === 0) throw createError('Auction not found', 404);

    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw createError('Auction not found', 404);

    if (!isAdmin && auction.sellerId !== userId) throw createError('Not authorized', 403);
    if (auction.status === AuctionStatus.ENDED) throw createError('Auction already ended', 400);
    if (auction.status === AuctionStatus.CANCELLED) throw createError('Auction already cancelled', 400);

    // Fetch winning bids to refund
    const topBids = await tx.bid.findMany({
      where: { auctionId, status: 'WINNING' },
      include: { bidder: { include: { wallet: true } } },
    });

    if (topBids.length > 0) {
      // Phase A1: Decimal-safe per-user refund aggregation.
      // This handles sealed-bid auctions with multiple winning bids cleanly.
      const refunds: Record<string, Prisma.Decimal> = {};
      const userWallets: Record<string, { id: string }> = {};

      for (const bid of topBids) {
        if (bid.bidder.wallet) {
          const prior = refunds[bid.bidderId] ?? D(0);
          refunds[bid.bidderId] = prior.add(bid.amount);
          userWallets[bid.bidderId] = bid.bidder.wallet;
        }
      }

      // ── 2. Lock wallets in strict ascending order of userId to prevent deadlocks ──
      const sortedUserIds = Object.keys(refunds).sort();
      for (const uid of sortedUserIds) {
        await tx.$queryRaw`SELECT id FROM wallets WHERE "userId" = ${uid} FOR UPDATE`;
      }

      // Execute wallet updates + ledger logs
      for (const uid of sortedUserIds) {
        const amount = refunds[uid];
        const wallet = userWallets[uid];

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: amount },
            heldAmount: { decrement: amount },
          },
        });

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            userId: uid,
            type: 'BID_RELEASE',
            amount,
            description: `Auction cancelled: "${auction.title}"`,
            referenceId: auctionId,
          },
        });
      }

      // Update bids status to OUTBID
      const bidIds = topBids.map((b) => b.id);
      await tx.bid.updateMany({
        where: { id: { in: bidIds } },
        data: { status: 'OUTBID' },
      });
    }

    const cancelled = await tx.auction.update({
      where: { id: auctionId },
      data: { status: AuctionStatus.CANCELLED },
    });

    return cancelled;
  });

  return serializeMoney(result);
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

    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw createError('Auction not found', 404);
    if (auction.status !== AuctionStatus.ACTIVE) throw createError('Auction not active', 400);
    if (!auction.buyNowPrice) throw createError('No buy-now price set', 400);
    if (auction.sellerId === buyerId) throw createError("Can't buy your own auction", 403);

    // Phase A5: the buyer->seller transfer, the balance check, the paired
    // PAYMENT ledger rows and the idempotency guard all live in the shared
    // escrow path now. buyNow is a DIRECT_SALE: money comes straight out of the
    // buyer's spendable balance. settleWithinTx already holds the auction lock
    // (taken above) and locks the two wallets in order.
    const { alreadySettled } = await settleWithinTx(tx, {
      auctionId,
      auctionTitle: auction.title,
      payerId: buyerId,
      sellerId: auction.sellerId,
      amount: auction.buyNowPrice,
      kind: SettlementKind.DIRECT_SALE,
    });

    // A genuine buy-now retry is already rejected by the "Auction not active"
    // guard above (the first buy-now flipped status to ENDED in its own tx).
    // Reaching here with alreadySettled means a settled-but-not-ended
    // inconsistency -- don't rewrite actualEndTime/currentPrice, just return
    // the row as it currently stands so the retry is a true no-op.
    if (alreadySettled) return serializeMoney(auction);

    // End auction with this buyer as winner.
    const updated = await tx.auction.update({
      where: { id: auctionId },
      data: {
        status: AuctionStatus.ENDED,
        winnerId: buyerId,
        currentPrice: D(auction.buyNowPrice),
        actualEndTime: new Date(),
      },
    });
    return serializeMoney(updated);
  });
};
