/* eslint-disable @typescript-eslint/no-explicit-any */
import { auctionQueue, dutchAuctionQueue, notificationQueue } from './auction.queue';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name) => ({
    name,
    on: jest.fn(),
  })),
}));

describe('Queues', () => {
  it('should initialize auction scheduler queue', () => {
    expect(auctionQueue).toBeDefined();
    expect((auctionQueue as any).name).toBe('auction-scheduler');
  });

  it('should initialize dutch auction queue', () => {
    expect(dutchAuctionQueue).toBeDefined();
    expect((dutchAuctionQueue as any).name).toBe('dutch-auction');
  });

  it('should initialize notification queue', () => {
    expect(notificationQueue).toBeDefined();
    expect((notificationQueue as any).name).toBe('notifications');
  });
});
