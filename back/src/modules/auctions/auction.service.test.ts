/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAuction, getAuctions, getAuctionById, updateAuction, cancelAuction, buyNow } from './auction.service';
import { prismaMock } from '../../__mocks__/prisma';
import { auctionQueue } from '../../queues/auction.queue';
import { AuctionStatus, AuctionType } from '@prisma/client';

jest.mock('../../queues/auction.queue', () => ({
  auctionQueue: { add: jest.fn() }
}));

describe('Auction Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAuction', () => {
    it('should create an auction and schedule jobs', async () => {
      const mockData = {
        title: 'Test',
        description: 'Test Desc',
        type: AuctionType.ENGLISH,
        startingPrice: 100,
        startTime: new Date(Date.now() + 10000), // future
        endTime: new Date(Date.now() + 20000), // future
      };

      prismaMock.auction.create.mockResolvedValue({ id: 'a1', ...mockData, status: 'PENDING' } as any);

      const res = await createAuction('u1', mockData);

      expect(prismaMock.auction.create).toHaveBeenCalled();
      expect(auctionQueue.add).toHaveBeenCalledTimes(2); // start and end jobs
      expect(res.id).toBe('a1');
    });

    it('should throw if end time is before start time', async () => {
      await expect(createAuction('u1', {
        title: 'Test',
        description: 'Test Desc',
        type: AuctionType.ENGLISH,
        startingPrice: 100,
        startTime: new Date(Date.now() + 20000),
        endTime: new Date(Date.now() + 10000),
      })).rejects.toThrow('End time must be after start time');
    });
  });

  describe('getAuctions', () => {
    it('runs the FTS raw query and feeds matched ids into the Prisma filter when search is present', async () => {
      (prismaMock.$queryRaw as any).mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }]);
      prismaMock.auction.findMany.mockResolvedValue([{ id: 'a1' }] as any);
      prismaMock.auction.count.mockResolvedValue(1 as any);

      const res = await getAuctions({ search: 'rol watch' });

      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.auction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['a1', 'a2'] } }) })
      );
      expect(res.total).toBe(1);
    });

    it('returns an empty page without touching the DB when the search has no usable tokens', async () => {
      const res = await getAuctions({ search: '!!! ???' });

      expect(res).toEqual({ auctions: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
      expect(prismaMock.auction.findMany).not.toHaveBeenCalled();
    });

    it('does not run the FTS query when no search term is given', async () => {
      prismaMock.auction.findMany.mockResolvedValue([] as any);
      prismaMock.auction.count.mockResolvedValue(0 as any);

      await getAuctions({ status: AuctionStatus.ACTIVE });

      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('getAuctionById', () => {
    it('should return auction with watchlist and autobid info', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ id: 'a1', sellerId: 'u2' } as any);
      prismaMock.watchlistItem.findUnique.mockResolvedValue({ id: 'w1' } as any);
      prismaMock.autoBid.findUnique.mockResolvedValue({ isActive: true, maxAmount: 500 } as any);

      const res = await getAuctionById('a1', 'u1');

      expect(res.isWatched).toBe(true);
      expect(res.autoBid?.isActive).toBe(true);
    });

    it('should throw if not found', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(null);
      await expect(getAuctionById('a1')).rejects.toThrow('Auction not found');
    });

    it('strips the embedded bids[] to viewer-only entries when sealed+ACTIVE', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'a1',
        sellerId: 'seller',
        type: AuctionType.SEALED_BID,
        status: AuctionStatus.ACTIVE,
        bids: [
          { id: 'b1', bidderId: 'viewer', amount: 200, bidder: { id: 'viewer', name: 'Me' } },
          { id: 'b2', bidderId: 'other',  amount: 999, bidder: { id: 'other',  name: 'Other' } },
        ],
      } as any);
      prismaMock.watchlistItem.findUnique.mockResolvedValue(null);
      prismaMock.autoBid.findUnique.mockResolvedValue(null);

      const res = await getAuctionById('a1', 'viewer');

      // Only the viewer's own bid survives. The other bidder must not appear
      // at all -- not just have their name redacted.
      expect(res.bids).toHaveLength(1);
      expect(res.bids[0].id).toBe('b1');
      expect(res.bids.find((b: any) => b.bidderId === 'other')).toBeUndefined();
    });

    it('returns full bids[] once a sealed auction has ENDED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'a1',
        sellerId: 'seller',
        type: AuctionType.SEALED_BID,
        status: AuctionStatus.ENDED,
        bids: [
          { id: 'b1', bidderId: 'viewer', amount: 200, bidder: { id: 'viewer', name: 'Me' } },
          { id: 'b2', bidderId: 'other',  amount: 999, bidder: { id: 'other',  name: 'Other' } },
        ],
      } as any);
      prismaMock.watchlistItem.findUnique.mockResolvedValue(null);
      prismaMock.autoBid.findUnique.mockResolvedValue(null);

      const res = await getAuctionById('a1', 'viewer');
      expect(res.bids).toHaveLength(2);
    });
  });

  describe('updateAuction', () => {
    it('should update if valid and pending', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ id: 'a1', sellerId: 'u1', status: 'PENDING' } as any);
      prismaMock.auction.update.mockResolvedValue({ id: 'a1', title: 'New' } as any);

      const res = await updateAuction('a1', 'u1', { title: 'New' });
      expect(res.title).toBe('New');
    });

    it('should throw if not pending', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ id: 'a1', sellerId: 'u1', status: 'ACTIVE' } as any);
      await expect(updateAuction('a1', 'u1', { title: 'New' })).rejects.toThrow('Cannot edit an active or ended auction');
    });
  });

  describe('cancelAuction', () => {
    it('should cancel and refund bids', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ id: 'a1', sellerId: 'u1', status: 'ACTIVE' } as any);
      prismaMock.bid.findMany.mockResolvedValue([
        { id: 'b1', amount: 100, bidder: { wallet: { id: 'w1' } } } as any
      ]);
      prismaMock.auction.update.mockResolvedValue({ id: 'a1', status: 'CANCELLED' } as any);

      await cancelAuction('a1', 'u1');

      expect(prismaMock.wallet.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'w1' }
      }));
      expect(prismaMock.auction.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { status: 'CANCELLED' }
      });
    });
  });

  describe('buyNow', () => {
    it('should throw if insufficient balance', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ id: 'a1', status: 'ACTIVE', buyNowPrice: 1000, sellerId: 'u2' } as any);
      prismaMock.wallet.findUnique.mockResolvedValue({ userId: 'u1', balance: 500 } as any);

      await expect(buyNow('a1', 'u1')).rejects.toThrow('Insufficient wallet balance');
    });

    it('should process transaction if valid', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ id: 'a1', status: 'ACTIVE', buyNowPrice: 1000, sellerId: 'u2' } as any);
      prismaMock.wallet.findUnique.mockResolvedValue({ userId: 'u1', balance: 2000 } as any);
      
      // Mock prisma.$transaction
      prismaMock.$transaction.mockImplementation(async (cb) => {
        return cb(prismaMock);
      });
      // Both wallet lookups (payer then seller) resolve to a funded wallet.
      // Phase A5: the balance check + transfer run inside settleWithinTx, so the
      // payer wallet must carry a balance >= buyNowPrice or D(undefined) throws.
      prismaMock.wallet.findUnique.mockResolvedValue({ id: 'w_test', balance: 2000 } as any);
      prismaMock.auction.update.mockResolvedValue({ id: 'a1', status: 'ENDED' } as any);

      await buyNow('a1', 'u1');

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.wallet.update).toHaveBeenCalledTimes(2); // deduct and credit
    });
  });
});
