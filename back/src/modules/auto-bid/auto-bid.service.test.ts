/* eslint-disable @typescript-eslint/no-explicit-any */
import { setAutoBid, cancelAutoBid, processAutoBids, getMyAutoBid as _getMyAutoBid } from './auto-bid.service';
import { prismaMock } from '../../__mocks__/prisma';
import { m } from '../../__mocks__/money';
import { placeBid } from '../bidding/bid.service';
import { notifyUser } from '../notifications/notification.service';
import { AuctionStatus, AuctionType } from '@prisma/client';

jest.mock('../bidding/bid.service', () => ({
  placeBid: jest.fn(),
}));

jest.mock('../notifications/notification.service', () => ({
  notifyUser: jest.fn(),
}));

describe('AutoBid Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const defaultAuction = {
    id: 'a1',
    sellerId: 'u2',
    status: AuctionStatus.ACTIVE,
    type: AuctionType.ENGLISH,
    currentPrice: 100,
    minIncrement: 10,
    reservePrice: null,
  } as any;

  describe('setAutoBid', () => {
    it('should throw if auction is not active', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ ...defaultAuction, status: AuctionStatus.ENDED });
      await expect(setAutoBid({ auctionId: 'a1', bidderId: 'u1', maxAmount: 200 })).rejects.toThrow('Auction not active');
    });

    it('should throw if user is the seller', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ ...defaultAuction, sellerId: 'u1' });
      await expect(setAutoBid({ auctionId: 'a1', bidderId: 'u1', maxAmount: 200 })).rejects.toThrow("Can't auto-bid on your own auction");
    });

    it('rejects auto-bid on sealed auctions outright (Phase A4 follow-up)', async () => {
      // Auto-bid math depends on a moving currentPrice + minIncrement
      // ladder. Phase A4 fixed placeBid to keep currentPrice constant for
      // sealed auctions (to plug the privacy leak), so an auto-bid set on
      // a sealed auction would either no-op or misfire. We block it at
      // the validation layer instead.
      const sealedAuction = { ...defaultAuction, type: AuctionType.SEALED_BID };
      prismaMock.auction.findUnique.mockResolvedValue(sealedAuction);
      await expect(
        setAutoBid({ auctionId: 'a1', bidderId: 'u1', maxAmount: 500 })
      ).rejects.toThrow('Auto-bid is not supported on sealed-bid auctions');
    });

    it('should validate maxAmount for English auctions', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      await expect(setAutoBid({ auctionId: 'a1', bidderId: 'u1', maxAmount: 90 })).rejects.toThrow('Max amount must be greater than current price');
    });

    it('should validate maxAmount for Dutch auctions (auto-accept)', async () => {
      const dutchAuction = { ...defaultAuction, type: AuctionType.DUTCH, reservePrice: 50 };
      prismaMock.auction.findUnique.mockResolvedValue(dutchAuction);
      
      // Must be lower than current
      await expect(setAutoBid({ auctionId: 'a1', bidderId: 'u1', maxAmount: 150 })).rejects.toThrow('Auto-accept price must be lower than current price');
      // Must be >= reserve
      await expect(setAutoBid({ auctionId: 'a1', bidderId: 'u1', maxAmount: 40 })).rejects.toThrow('Auto-accept price cannot be below reserve price');
    });

    it('should throw if insufficient wallet balance', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      prismaMock.wallet.findUnique.mockResolvedValue({ balance: 50, heldAmount: 0 } as any); // min bid is 110
      await expect(setAutoBid({ auctionId: 'a1', bidderId: 'u1', maxAmount: 500 })).rejects.toThrow('Insufficient available balance for auto-bid');
    });

    it('should upsert auto-bid if valid', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      prismaMock.wallet.findUnique.mockResolvedValue({ balance: 1000, heldAmount: 0 } as any);
      prismaMock.autoBid.upsert.mockResolvedValue({ id: 'ab1' } as any);

      const res = await setAutoBid({ auctionId: 'a1', bidderId: 'u1', maxAmount: 500 });

      expect(prismaMock.autoBid.upsert).toHaveBeenCalledWith({
        where: { auctionId_bidderId: { auctionId: 'a1', bidderId: 'u1' } },
        update: { maxAmount: m(500), isActive: true },
        create: { auctionId: 'a1', bidderId: 'u1', maxAmount: m(500) },
      });
      expect(res.id).toBe('ab1');
    });
  });

  describe('cancelAutoBid', () => {
    it('should mark auto-bid as inactive', async () => {
      prismaMock.autoBid.updateMany.mockResolvedValue({ count: 1 } as any);
      const res = await cancelAutoBid('a1', 'u1');
      expect(prismaMock.autoBid.updateMany).toHaveBeenCalledWith({
        where: { auctionId: 'a1', bidderId: 'u1' },
        data: { isActive: false },
      });
      expect(res.message).toBe('Auto-bid cancelled');
    });
  });

  describe('processAutoBids', () => {
    it('should do nothing if no active auto-bids', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      prismaMock.autoBid.findMany.mockResolvedValue([]);
      
      await processAutoBids('a1', 'u_winner', 100);
      expect(placeBid).not.toHaveBeenCalled();
    });

    it('should deactivate auto-bids if maxAmount is lower than next minimum bid', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction); // next min bid = 110
      prismaMock.autoBid.findMany.mockResolvedValue([{ maxAmount: 105 }] as any);
      
      await processAutoBids('a1', 'u_winner', 100);
      
      expect(prismaMock.autoBid.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: { isActive: false },
      }));
      expect(placeBid).not.toHaveBeenCalled();
    });

    it('should place bid with minimum required increment if only one auto-bidder', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction); // next min bid = 110
      const topAutoBid = { id: 'ab1', bidderId: 'u_auto', maxAmount: 500 };
      prismaMock.autoBid.findMany.mockResolvedValueOnce([topAutoBid] as any).mockResolvedValueOnce([]);
      
      (placeBid as jest.Mock).mockResolvedValue({ id: 'bid1', amount: 110, bidderId: 'u_auto', createdAt: new Date() });

      await processAutoBids('a1', 'u_winner', 100);
      
      expect(placeBid).toHaveBeenCalledWith({
        auctionId: 'a1',
        bidderId: 'u_auto',
        amount: 110,
        isAutoBid: true,
      });
      expect(prismaMock.autoBid.update).toHaveBeenCalledWith({
        where: { id: 'ab1' },
        data: { currentBid: m(110) }
      });
      expect(notifyUser).toHaveBeenCalledWith('u_auto', expect.objectContaining({ type: 'AUTO_BID_PLACED' }));
    });

    it('should calculate competitive bid when multiple auto-bidders exist', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      const topAutoBid = { id: 'ab1', bidderId: 'u_top', maxAmount: 500 };
      const secondAutoBid = { id: 'ab2', bidderId: 'u_second', maxAmount: 300 };
      prismaMock.autoBid.findMany.mockResolvedValueOnce([topAutoBid, secondAutoBid] as any).mockResolvedValueOnce([]);
      
      (placeBid as jest.Mock).mockResolvedValue({ id: 'bid1', amount: 310 }); // should beat 300 by 1 increment (10)

      await processAutoBids('a1', 'u_winner', 100);
      
      expect(placeBid).toHaveBeenCalledWith(expect.objectContaining({
        amount: 310
      }));
    });

    it('should cap competitive bid to top bidder max amount', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction); // increment 10
      const topAutoBid = { id: 'ab1', bidderId: 'u_top', maxAmount: 305 };
      const secondAutoBid = { id: 'ab2', bidderId: 'u_second', maxAmount: 300 };
      prismaMock.autoBid.findMany.mockResolvedValueOnce([topAutoBid, secondAutoBid] as any).mockResolvedValueOnce([]);
      
      (placeBid as jest.Mock).mockResolvedValue({ id: 'bid1', amount: 305 }); // 300 + 10 = 310 > 305, cap at 305

      await processAutoBids('a1', 'u_winner', 100);
      
      expect(placeBid).toHaveBeenCalledWith(expect.objectContaining({
        amount: 305
      }));
    });

    it('should deactivate auto-bid if placeBid throws insufficient balance', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      const topAutoBid = { id: 'ab1', bidderId: 'u_top', maxAmount: 500 };
      prismaMock.autoBid.findMany.mockResolvedValueOnce([topAutoBid] as any).mockResolvedValueOnce([]);
      
      (placeBid as jest.Mock).mockRejectedValue({
        statusCode: 400,
        message: 'Insufficient available balance',
      });

      await processAutoBids('a1', 'u_winner', 100);
      
      expect(prismaMock.autoBid.update).toHaveBeenCalledWith({
        where: { id: 'ab1' },
        data: { isActive: false }
      });
    });
  });
});
