/* eslint-disable @typescript-eslint/no-explicit-any */
import { placeBid, getAuctionBids } from './bid.service';
import { prismaMock } from '../../__mocks__/prisma';
import { m } from '../../__mocks__/money';
import { notifyUser } from '../notifications/notification.service';
import { processAutoBids } from '../auto-bid/auto-bid.service';
import { AuctionStatus, AuctionType } from '@prisma/client';
import { io } from '../../index';

jest.mock('../notifications/notification.service', () => ({
  notifyUser: jest.fn(),
}));

jest.mock('../auto-bid/auto-bid.service', () => ({
  processAutoBids: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../index', () => ({
  io: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  },
}));

describe('Bid Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup transaction mock to just yield the standard prismaMock object
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  });

  describe('placeBid', () => {
    const defaultAuction: any = {
      id: 'a1',
      sellerId: 'u2',
      status: AuctionStatus.ACTIVE,
      type: AuctionType.ENGLISH,
      currentPrice: 100,
      minIncrement: 10,
      endTime: new Date(Date.now() + 100000), // future
      antiSnipingMins: 0,
    };

    it('should throw if auction is not found', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(null);
      await expect(placeBid({ auctionId: 'a1', bidderId: 'u1', amount: 120 })).rejects.toThrow('Auction not found');
    });

    it('should throw if user tries to bid on their own auction', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ ...defaultAuction, sellerId: 'u1' });
      await expect(placeBid({ auctionId: 'a1', bidderId: 'u1', amount: 120 })).rejects.toThrow("Can't bid on your own auction");
    });

    it('should throw if bid amount is below minimum increment for English auctions', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      await expect(placeBid({ auctionId: 'a1', bidderId: 'u1', amount: 105 })).rejects.toThrow('Minimum bid is 110');
    });

    it('should throw if wallet has insufficient available balance', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      prismaMock.wallet.findUnique.mockResolvedValue({ userId: 'u1', balance: 100, heldAmount: 50 } as any); // available 50
      await expect(placeBid({ auctionId: 'a1', bidderId: 'u1', amount: 120 })).rejects.toThrow('Insufficient available balance');
    });

    it('should place successful English bid and release previous hold', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      prismaMock.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 500, heldAmount: 0 } as any);
      
      const prevBid = {
        id: 'b_prev',
        bidderId: 'u3',
        amount: 100,
        bidder: { wallet: { id: 'w3' } }
      };
      prismaMock.bid.findFirst.mockResolvedValue(prevBid as any);
      prismaMock.wallet.update.mockResolvedValue({ id: 'w1' } as any);
      prismaMock.bid.create.mockResolvedValue({ id: 'b_new' } as any);

      await placeBid({ auctionId: 'a1', bidderId: 'u1', amount: 120 });

      // Check previous bid was outbid. Prev wallet refund uses the prev bid
      // amount, which Prisma can store as number or Decimal -- match either.
      expect(prismaMock.bid.update).toHaveBeenCalledWith({ where: { id: 'b_prev' }, data: { status: 'OUTBID' } });
      expect(prismaMock.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w3' },
        data: { balance: { increment: m(100) }, heldAmount: { decrement: m(100) } }
      });
      expect(notifyUser).toHaveBeenCalledWith('u3', expect.objectContaining({ type: 'OUTBID' }));

      // Check new bid held (Decimal-tolerant via m()).
      expect(prismaMock.wallet.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { balance: { decrement: m(120) }, heldAmount: { increment: m(120) } }
      });
      expect(prismaMock.bid.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ amount: m(120), status: 'WINNING' })
      }));
    });

    it('should end Dutch auction immediately on bid', async () => {
      const dutchAuction = { ...defaultAuction, type: AuctionType.DUTCH, currentPrice: 500 };
      prismaMock.auction.findUnique.mockResolvedValue(dutchAuction);
      prismaMock.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 1000, heldAmount: 0 } as any);
      prismaMock.wallet.update.mockResolvedValue({ id: 'w1' } as any);
      prismaMock.bid.create.mockResolvedValue({ id: 'b_new' } as any);

      await placeBid({ auctionId: 'a1', bidderId: 'u1', amount: 500 });

      expect(prismaMock.auction.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ status: AuctionStatus.ENDED, winnerId: 'u1' })
      }));
    });

    it('should trigger processAutoBids via setImmediate', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      prismaMock.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 500, heldAmount: 0 } as any);
      prismaMock.wallet.update.mockResolvedValue({ id: 'w1' } as any);
      prismaMock.bid.findFirst.mockResolvedValue(null);
      prismaMock.bid.create.mockResolvedValue({ id: 'b_new' } as any);

      await placeBid({ auctionId: 'a1', bidderId: 'u1', amount: 120 });

      await new Promise(resolve => setImmediate(resolve)); // Execute setImmediate queue
      
      expect(processAutoBids).toHaveBeenCalledWith('a1', 'u1', 120, io);
    });
  });

  describe('getAuctionBids', () => {
    it('masks amount + identity for other bidders, reveals own bid, while sealed+ACTIVE', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'a1', type: AuctionType.SEALED_BID, status: AuctionStatus.ACTIVE,
      } as any);
      prismaMock.bid.findMany.mockResolvedValue([
        { id: 'b1', auctionId: 'a1', bidderId: 'viewer', amount: 200, status: 'ACTIVE', isAutoBid: false, createdAt: new Date('2026-01-01') },
        { id: 'b2', auctionId: 'a1', bidderId: 'other',  amount: 500, status: 'ACTIVE', isAutoBid: false, createdAt: new Date('2026-01-02') },
      ] as any);

      const out = await getAuctionBids('a1', 'viewer');

      // findMany must use createdAt order (not amount desc) and a select (not include)
      // so no leaked field can sneak in.
      expect(prismaMock.bid.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: { createdAt: 'asc' },
      }));
      const call = (prismaMock.bid.findMany as any).mock.calls[0][0];
      expect(call.select).toBeDefined();
      expect(call.include).toBeUndefined();

      // Viewer sees their own bid amount; everyone else's amount + identity is null.
      expect(out).toEqual([
        expect.objectContaining({ id: 'b1', amount: 200, bidderId: 'viewer', bidder: { id: 'viewer' } }),
        expect.objectContaining({ id: 'b2', amount: null,  bidderId: null,     bidder: null }),
      ]);
    });

    it('returns full bid data (name + avatar) once a sealed auction has ENDED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'a1', type: AuctionType.SEALED_BID, status: AuctionStatus.ENDED,
      } as any);
      prismaMock.bid.findMany.mockResolvedValue([{ id: 'b1', amount: 200 }] as any);

      await getAuctionBids('a1', 'viewer');

      expect(prismaMock.bid.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: { amount: 'desc' },
        include: { bidder: { select: { id: true, name: true, avatar: true } } },
      }));
    });
  });
});
