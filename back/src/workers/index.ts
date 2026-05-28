import { Worker, Job } from 'bullmq';
import { AuctionStatus, AuctionType, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { bullMQConnection } from '../lib/redis';
import { io } from '../index';
import { notifyUser } from '../modules/notifications/notification.service';
import { dutchAuctionQueue } from '../queues/auction.queue';
import { D, neg, toNum } from '../lib/decimal';

const workerOptions = {
  connection: bullMQConnection as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  stalledInterval: 300000, // 5 mins (reduces Lua script polling)
  maxStalledCount: 1,
};

/**
 * Auction Scheduler Worker
 * Handles: start-auction, end-auction jobs
 */
const auctionWorker = new Worker(
  'auction-scheduler',
  async (job: Job) => {
    if (job.name === 'start-auction') {
      const { auctionId } = job.data;

      const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
      if (!auction || auction.status !== AuctionStatus.PENDING) return;

      await prisma.auction.update({
        where: { id: auctionId },
        data: { status: AuctionStatus.ACTIVE },
      });

      io.emit('auction:started', { auctionId });

      // If Dutch auction, start price-drop scheduler
      if (auction.type === 'DUTCH' && auction.dutchInterval && auction.dutchPriceStep) {
        await dutchAuctionQueue.add(
          'drop-price',
          { auctionId, step: auction.dutchPriceStep },
          { repeat: { every: auction.dutchInterval * 1000 } }
        );
      }

      // Notify watchlist users
      const watchers = await prisma.watchlistItem.findMany({
        where: { auctionId },
        select: { userId: true },
      });

      for (const watcher of watchers) {
        notifyUser(watcher.userId, {
          type: 'AUCTION_STARTED',
          title: 'Auction Started!',
          message: `"${auction.title}" is now live!`,
          data: { auctionId },
        });
      }
    }

    if (job.name === 'end-auction') {
      await endAuction(job.data.auctionId);
    }
  },
  workerOptions
);

/**
 * Dutch Auction Price Drop Worker
 */
const dutchWorker = new Worker(
  'dutch-auction',
  async (job: Job) => {
    if (job.name === 'drop-price') {
      const { auctionId, step } = job.data;

      const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
      if (!auction || auction.status !== AuctionStatus.ACTIVE) return;

      // Phase A1: Decimal-safe price drop. Floor at zero.
      const zero = D(0);
      const dropped = D(auction.currentPrice).sub(step);
      const newPriceD = dropped.lt(zero) ? zero : dropped;

      // If price hits 0 or below reserve, end the auction
      if (newPriceD.lte(zero) || (auction.reservePrice && newPriceD.lt(auction.reservePrice))) {
        await endAuction(auctionId);
        return;
      }

      await prisma.auction.update({
        where: { id: auctionId },
        data: { currentPrice: newPriceD },
      });

      io.to(`auction:${auctionId}`).emit('auction:price-drop', {
        auctionId,
        newPrice: toNum(newPriceD),
      });
    }
  },
  workerOptions
);

async function endAuction(auctionId: string) {
  // Phase A2: BullMQ can re-deliver a job (worker crash + retry, stalled-job
  // recovery). Two simultaneous endAuction invocations both reading
  // `status !== ENDED` then both updating to ENDED would double-settle:
  // pay the seller twice, mark two winners. Lock the auction row and
  // re-check inside the tx so only one path wins.
  //
  // The settlement work (bid status changes, wallet refunds for sealed
  // losers, etc.) is intentionally split out of this lock-acquisition tx
  // so we don't hold long locks across many wallet rows. The state flip
  // to ENDED is the idempotency barrier -- once it commits, the second
  // worker sees ENDED and bails.
  const { committed, auctionSnap, winningBid, winner, metReserve } =
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE
      `;
      if (locked.length === 0) {
        return { committed: false, auctionSnap: null, winningBid: null, winner: null, metReserve: false };
      }

      const a = await tx.auction.findUnique({
        where: { id: auctionId },
        include: {
          bids: {
            where: { status: 'WINNING' },
            orderBy: { amount: 'desc' },
            take: 1,
            include: { bidder: true },
          },
        },
      });

      if (!a || a.status === AuctionStatus.ENDED) {
        return { committed: false, auctionSnap: null, winningBid: null, winner: null, metReserve: false };
      }

      const wb = a.bids[0] ?? null;
      // Phase A1: Decimal-safe reserve check (Decimal.js valueOf would coerce
      // to JS number for `>=`, which is fragile for high-precision values).
      const reserveOk = !a.reservePrice || (wb !== null && D(wb.amount).gte(a.reservePrice));
      const w = reserveOk && wb ? wb.bidderId : null;

      await tx.auction.update({
        where: { id: auctionId },
        data: {
          status: AuctionStatus.ENDED,
          winnerId: w,
          winnerBidId: w ? wb!.id : null,
          actualEndTime: new Date(),
        },
      });

      return { committed: true, auctionSnap: a, winningBid: wb, winner: w, metReserve: reserveOk };
    });

  if (!committed || !auctionSnap) return; // duplicate / already-ended
  const auction = auctionSnap;

  // Update bid statuses for sealed bid
  if (auction.type === 'SEALED_BID') {
    const allBids = await prisma.bid.findMany({
      where: { auctionId },
      orderBy: { amount: 'desc' },
    });

    if (allBids.length > 0) {
      await prisma.bid.update({ where: { id: allBids[0].id }, data: { status: 'WON' } });
      const loserIds = allBids.slice(1).map((b) => b.id);
      if (loserIds.length > 0) {
        await prisma.bid.updateMany({ where: { id: { in: loserIds } }, data: { status: 'LOST' } });

        // Phase A1: Decimal-safe per-user refund aggregation. Without Decimal,
        // repeated `+= loser.amount` on Float would drift on edge values.
        const refunds: Record<string, Prisma.Decimal> = {};
        for (const loser of allBids.slice(1)) {
          const prior = refunds[loser.bidderId] ?? D(0);
          refunds[loser.bidderId] = prior.add(loser.amount);
        }

        const refundUpdates = Object.entries(refunds).map(([userId, amount]) =>
          prisma.wallet.update({
            where: { userId },
            data: {
              balance: { increment: amount },
              heldAmount: { decrement: amount },
            },
          })
        );

        // Execute batch updates atomically
        await prisma.$transaction(refundUpdates);
      }
    }
  }

  // Phase A1: emit number-typed prices so socket subscribers don't choke on
  // Decimal serialization.
  const finalPriceNum = winningBid ? toNum(winningBid.amount) : null;

  // Emit to all watchers
  io.to(`auction:${auctionId}`).emit('auction:ended', {
    auctionId,
    winnerId: winner,
    finalPrice: finalPriceNum,
    metReserve,
  });

  // Notify winner
  if (winner && winningBid) {
    notifyUser(winner, {
      type: 'AUCTION_WON',
      title: 'You won the auction!',
      message: `You won "${auction.title}" for ${finalPriceNum}`,
      data: { auctionId, amount: finalPriceNum },
    });
  }

  // Notify watchlist users
  const watchers = await prisma.watchlistItem.findMany({
    where: { auctionId, userId: { not: winner || undefined } },
    select: { userId: true },
  });

  for (const watcher of watchers) {
    notifyUser(watcher.userId, {
      type: 'AUCTION_ENDED',
      title: 'Auction ended',
      message: winner
        ? `"${auction.title}" ended. Final price: ${finalPriceNum}`
        : `"${auction.title}" ended with no winner (reserve not met)`,
      data: { auctionId },
    });
  }
}

/**
 * Phase A6: atomic auto-bid ladder.
 *
 * Replaces the old `processAutoBids` recursion. Invariants:
 *
 *   1. The full ladder runs in ONE prisma.$transaction. Either every step in
 *      the bid log persists or none of it does. No partial states observable
 *      from other readers.
 *   2. Lock order obeyed: auction row first, then every involved wallet in
 *      ascending userId order. Walks every auto-bidder + the trigger bidder.
 *   3. Per ladder step we always bid exactly `currentPrice + minIncrement`
 *      (never jump to the challenger's maxAmount in one go). This is the UX
 *      contract: the bid history page must render every 1100, 1200, 1300, ...
 *      step the engine produced, not the closed-form "winner ended at X" only.
 *   4. Affordability is checked BEFORE any DB write. A challenger who would
 *      not be able to pay is deactivated and skipped; the previous winner's
 *      hold stays where it was.
 *   5. The loop is bounded by `(highestMaxAmount - currentPrice) / minIncrement
 *      + a small slack`, so a malformed auto-bid table cannot spin forever.
 *
 * Returns the per-step plan that the caller emits to the socket room after
 * the tx commits. Each entry mirrors the existing `bid:new` socket payload.
 *
 * Only English auctions ladder. Dutch ends on first accept; Sealed has no
 * public currentPrice.
 *
 * Exported so the test suite can call the ladder directly without spinning
 * up BullMQ.
 */
export interface LadderStep {
  bidId: string;
  bidderId: string;
  amount: number;
  createdAt: Date;
  auctionTitle: string;
}

export async function processAutoBidLadder(
  auctionId: string,
  triggerBidderId: string,
): Promise<LadderStep[]> {
  const steps: LadderStep[] = [];

  await prisma.$transaction(async (tx) => {
    // ── Lock auction row first ──
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE
    `;
    if (locked.length === 0) return;

    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status !== AuctionStatus.ACTIVE) return;

    // Only English auctions use the ladder. Dutch ends on first accept; Sealed
    // keeps currentPrice frozen on purpose (Phase A4 privacy).
    if (auction.type !== AuctionType.ENGLISH) return;

    // Load every active auto-bid for this auction, except the trigger bidder's
    // own (they just placed a manual bid; their auto-bid -- if any -- doesn't
    // challenge themselves).
    const autoBids = await tx.autoBid.findMany({
      where: { auctionId, isActive: true, bidderId: { not: triggerBidderId } },
      orderBy: { maxAmount: 'desc' },
    });
    if (autoBids.length === 0) return;

    // ── Lock every wallet whose balance/heldAmount may move during the
    // ladder, in ascending userId order. The trigger bidder's wallet is also
    // locked because we may refund their previous hold when they get outbid.
    const allUserIds = Array.from(
      new Set([triggerBidderId, ...autoBids.map((a) => a.bidderId)]),
    ).sort();
    for (const uid of allUserIds) {
      await tx.$queryRaw`SELECT id FROM wallets WHERE "userId" = ${uid} FOR UPDATE`;
    }

    // Find the bid that's currently WINNING -- the trigger bid placed by
    // bid.service.placeBid moments earlier. The ladder may displace it.
    const triggerBid = await tx.bid.findFirst({
      where: { auctionId, bidderId: triggerBidderId, status: 'WINNING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!triggerBid) return; // race: bid was rolled back; nothing to do

    const inc = D(auction.minIncrement);
    let cur = D(auction.currentPrice);
    let curWinnerBidId = triggerBid.id;
    let curWinnerUserId = triggerBidderId;
    let curWinningAmount = D(triggerBid.amount);

    // Hot pool: auto-bids still able to participate. Filter applied per step.
    let pool = autoBids.slice();

    // Bound the loop. The ceiling is the highest-maxAmount auto-bid running
    // every increment from the current price; +2 covers fence-post edges.
    const highestMax = D(autoBids[0].maxAmount);
    const stepCeiling = highestMax.sub(cur).div(inc).ceil().toNumber() + 2;
    const maxSteps = Math.max(0, Math.min(100000, stepCeiling));

    for (let step = 0; step < maxSteps; step++) {
      const nextBid = cur.add(inc);

      // Drop anyone whose maxAmount can no longer cover nextBid, and skip the
      // current winner so they don't outbid themselves.
      pool = pool.filter(
        (ab) => D(ab.maxAmount).gte(nextBid) && ab.bidderId !== curWinnerUserId,
      );
      if (pool.length === 0) break;
      const challenger = pool[0]; // highest maxAmount in the remaining pool

      // ── Affordability check BEFORE any DB write ──
      // Re-read the challenger's wallet inside the tx -- the loop may have
      // already moved their balance/held in an earlier step.
      const cw = await tx.wallet.findUnique({ where: { userId: challenger.bidderId } });
      if (!cw) {
        pool = pool.filter((ab) => ab.id !== challenger.id);
        continue;
      }
      const available = D(cw.balance).sub(cw.heldAmount);
      if (available.lt(nextBid)) {
        // Deactivate auto-bids that ran out of money so they stop competing.
        await tx.autoBid.update({
          where: { id: challenger.id },
          data: { isActive: false },
        });
        pool = pool.filter((ab) => ab.id !== challenger.id);
        continue;
      }

      // ── 1. OUTBID the previous winner ──
      await tx.bid.update({
        where: { id: curWinnerBidId },
        data: { status: 'OUTBID' },
      });

      // ── 2. Refund the previous winner's hold ──
      const prevWallet = await tx.wallet.findUnique({
        where: { userId: curWinnerUserId },
      });
      if (prevWallet) {
        await tx.wallet.update({
          where: { userId: curWinnerUserId },
          data: {
            balance: { increment: curWinningAmount },
            heldAmount: { decrement: curWinningAmount },
          },
        });
        await tx.transaction.create({
          data: {
            walletId: prevWallet.id,
            userId: curWinnerUserId,
            type: 'BID_RELEASE',
            amount: curWinningAmount,
            description: `Outbid on "${auction.title}"`,
            referenceId: auctionId,
          },
        });
      }

      // ── 3. Place the challenger's bid ──
      const newBid = await tx.bid.create({
        data: {
          auctionId,
          bidderId: challenger.bidderId,
          amount: nextBid,
          status: 'WINNING',
          isAutoBid: true,
        },
      });

      // ── 4. Hold the challenger's new bid amount ──
      await tx.wallet.update({
        where: { userId: challenger.bidderId },
        data: {
          balance: { decrement: nextBid },
          heldAmount: { increment: nextBid },
        },
      });
      await tx.transaction.create({
        data: {
          walletId: cw.id,
          userId: challenger.bidderId,
          type: 'BID_HOLD',
          amount: neg(nextBid),
          description: `Auto-bid on "${auction.title}"`,
          referenceId: auctionId,
        },
      });

      // ── 5. Track the auto-bid's current bid ──
      await tx.autoBid.update({
        where: { id: challenger.id },
        data: { currentBid: nextBid },
      });

      // ── 6. Advance loop state ──
      cur = nextBid;
      curWinnerBidId = newBid.id;
      curWinnerUserId = challenger.bidderId;
      curWinningAmount = nextBid;

      steps.push({
        bidId: newBid.id,
        bidderId: challenger.bidderId,
        amount: toNum(nextBid) ?? 0,
        createdAt: newBid.createdAt,
        auctionTitle: auction.title,
      });
    }

    // ── Final auction.currentPrice update ──
    if (steps.length > 0) {
      await tx.auction.update({
        where: { id: auctionId },
        data: { currentPrice: cur },
      });
    }
  });

  return steps;
}

/**
 * Phase A7: notifications worker.
 *
 * Consumes `deliver` jobs from `notificationQueue`. For each one, writes a
 * Notification row and emits `notification:new` to the user's personal
 * socket room. This moves the DB write + socket fan-out off the request /
 * bid-transaction critical path that previously paid for it inline in
 * notifyUser().
 *
 * Failure semantics: if the DB write fails, BullMQ will retry (the queue
 * is configured with 3 attempts, exponential backoff). If the socket emit
 * fails (rare -- emits are best-effort, no ack), we shrug; the user will
 * see the notification on next inbox fetch.
 */
const notificationWorker = new Worker(
  'notifications',
  async (job: Job) => {
    if (job.name !== 'deliver') return;
    const { userId, type, title, message, data } = job.data as {
      userId: string;
      type: NotificationType;
      title: string;
      message: string;
      data?: Prisma.InputJsonValue;
    };

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data: data ?? {},
      },
    });

    io.to(`user:${userId}`).emit('notification:new', notification);
  },
  { ...workerOptions, concurrency: 10 },
);

const autoBidWorker = new Worker(
  'auto-bid',
  async (job: Job) => {
    if (job.name !== 'process-ladder') return;
    const { auctionId, triggerBidderId } = job.data as {
      auctionId: string;
      triggerBidderId: string;
    };

    const steps = await processAutoBidLadder(auctionId, triggerBidderId);

    // Post-commit side effects. Emitted in ladder order so the frontend
    // bid log animates the rungs.
    for (const s of steps) {
      io.to(`auction:${auctionId}`).emit('bid:new', {
        bid: {
          id: s.bidId,
          amount: s.amount,
          bidderId: s.bidderId,
          isAutoBid: true,
          createdAt: s.createdAt,
        },
      });
      notifyUser(s.bidderId, {
        type: 'AUTO_BID_PLACED',
        title: 'Auto-bid placed',
        message: `Auto-bid of ${s.amount} placed on "${s.auctionTitle}"`,
        data: { auctionId, amount: s.amount },
      });
    }
  },
  { ...workerOptions, concurrency: 5 },
);

export const initWorkers = () => {
  const handleWorkerError = (workerName: string) => (err: Error) => {
    if (!err.message.includes('ECONNREFUSED')) {
      console.error(`[Worker ${workerName}] connection error:`, err.message);
    }
  };

  auctionWorker.on('error', handleWorkerError('auction-scheduler'));
  dutchWorker.on('error', handleWorkerError('dutch-auction'));
  autoBidWorker.on('error', handleWorkerError('auto-bid'));
  notificationWorker.on('error', handleWorkerError('notifications'));

  auctionWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.name} (${job.id}) completed`);
  });

  auctionWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.name} failed:`, err.message);
  });

  dutchWorker.on('failed', (job, err) => {
    console.error(`[Dutch Worker] Job ${job?.name} failed:`, err.message);
  });

  autoBidWorker.on('failed', (job, err) => {
    console.error(`[AutoBid Worker] Job ${job?.name} failed:`, err.message);
  });

  notificationWorker.on('failed', (job, err) => {
    console.error(`[Notifications Worker] Job ${job?.name} failed:`, err.message);
  });

  console.log('BullMQ workers initialized');
};
