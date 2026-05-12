import { Worker, Job } from 'bullmq';
import { AuctionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { bullMQConnection } from '../lib/redis';
import { io } from '../index';
import { notifyUser } from '../modules/notifications/notification.service';
import { dutchAuctionQueue } from '../queues/auction.queue';

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

      const newPrice = Math.max(0, auction.currentPrice - step);

      // If price hits 0 or below reserve, end the auction
      if (newPrice <= 0 || (auction.reservePrice && newPrice < auction.reservePrice)) {
        await endAuction(auctionId);
        return;
      }

      await prisma.auction.update({
        where: { id: auctionId },
        data: { currentPrice: newPrice },
      });

      io.to(`auction:${auctionId}`).emit('auction:price-drop', { auctionId, newPrice });
    }
  },
  workerOptions
);

async function endAuction(auctionId: string) {
  const auction = await prisma.auction.findUnique({
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

  if (!auction || auction.status === AuctionStatus.ENDED) return;

  const winningBid = auction.bids[0];

  // Check reserve price
  const metReserve = !auction.reservePrice || (winningBid && winningBid.amount >= auction.reservePrice);

  const winner = metReserve && winningBid ? winningBid.bidderId : null;

  await prisma.auction.update({
    where: { id: auctionId },
    data: {
      status: AuctionStatus.ENDED,
      winnerId: winner,
      winnerBidId: winner ? winningBid!.id : null,
      actualEndTime: new Date(),
    },
  });

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

        // Refund losers (release held amounts)
        for (const loser of allBids.slice(1)) {
          await prisma.wallet.update({
            where: { userId: loser.bidderId },
            data: {
              balance: { increment: loser.amount },
              heldAmount: { decrement: loser.amount },
            },
          });
        }
      }
    }
  }

  // Emit to all watchers
  io.to(`auction:${auctionId}`).emit('auction:ended', {
    auctionId,
    winnerId: winner,
    finalPrice: winningBid?.amount,
    metReserve,
  });

  // Notify winner
  if (winner && winningBid) {
    notifyUser(winner, {
      type: 'AUCTION_WON',
      title: '🎉 You won the auction!',
      message: `You won "${auction.title}" for ${winningBid.amount}`,
      data: { auctionId, amount: winningBid.amount },
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
        ? `"${auction.title}" ended. Final price: ${winningBid?.amount}`
        : `"${auction.title}" ended with no winner (reserve not met)`,
      data: { auctionId },
    });
  }
}

export const initWorkers = () => {
  const handleWorkerError = (workerName: string) => (err: Error) => {
    if (!err.message.includes('ECONNREFUSED')) {
      console.error(`[Worker ${workerName}] connection error:`, err.message);
    }
  };

  auctionWorker.on('error', handleWorkerError('auction-scheduler'));
  dutchWorker.on('error', handleWorkerError('dutch-auction'));

  auctionWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.name} (${job.id}) completed`);
  });

  auctionWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.name} failed:`, err.message);
  });

  dutchWorker.on('failed', (job, err) => {
    console.error(`[Dutch Worker] Job ${job?.name} failed:`, err.message);
  });

  console.log('BullMQ workers initialized');
};
