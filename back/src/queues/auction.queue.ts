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
