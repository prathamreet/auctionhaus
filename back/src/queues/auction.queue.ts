import { Queue } from 'bullmq';
import { bullMQConnection } from '../lib/redis';

const handleQueueError = (queueName: string) => (err: Error) => {
  if (!err.message.includes('ECONNREFUSED')) {
    console.error(`[Queue ${queueName}] error:`, err.message);
  }
};

// Queue for scheduled auction start/end
export const auctionQueue = new Queue('auction-scheduler', {
  connection: bullMQConnection as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 50,
  },
});
auctionQueue.on('error', handleQueueError('auction-scheduler'));

// Queue for Dutch auction price drops
export const dutchAuctionQueue = new Queue('dutch-auction', {
  connection: bullMQConnection as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 50,
  },
});
dutchAuctionQueue.on('error', handleQueueError('dutch-auction'));

// Queue for sending notifications async
export const notificationQueue = new Queue('notifications', {
  connection: bullMQConnection as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});
notificationQueue.on('error', handleQueueError('notifications'));

// Phase A6: auto-bid ladder queue. The producer is bid.service.placeBid, AFTER
// its tx commits. The worker (in src/workers/index.ts) runs the full ladder in
// one prisma.$transaction, writing every increment as a Bid row so the bid
// log shows the ladder step-by-step (the UX contract).
//
// Concurrency on the worker is > 1; per-auction safety comes from the
// SELECT ... FOR UPDATE on auctions inside the ladder tx. Two jobs for the
// same auction will serialize at the row lock, two jobs for different
// auctions will run in parallel.
export const autoBidQueue = new Queue('auto-bid', {
  connection: bullMQConnection as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 500 },
  },
});
autoBidQueue.on('error', handleQueueError('auto-bid'));
