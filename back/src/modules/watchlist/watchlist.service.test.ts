/* eslint-disable @typescript-eslint/no-explicit-any */
import { getWatchlist, addToWatchlist, removeFromWatchlist } from './watchlist.service';
import { prismaMock } from '../../__mocks__/prisma';

describe('Watchlist Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWatchlist', () => {
    it('should return user watchlist items', async () => {
      const mockItems = [{ id: 'wl1', auctionId: 'a1' }];
      prismaMock.watchlistItem.findMany.mockResolvedValue(mockItems as any);

      const res = await getWatchlist('u1');
      
      expect(prismaMock.watchlistItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'u1' }
      }));
      expect(res).toEqual(mockItems);
    });
  });

  describe('addToWatchlist', () => {
    it('should throw if auction not found', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(null);
      await expect(addToWatchlist('u1', 'a1')).rejects.toThrow('Auction not found');
    });

    it('should upsert watchlist item', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ id: 'a1' } as any);
      prismaMock.watchlistItem.upsert.mockResolvedValue({ id: 'wl1' } as any);

      await addToWatchlist('u1', 'a1');

      expect(prismaMock.watchlistItem.upsert).toHaveBeenCalledWith({
        where: { userId_auctionId: { userId: 'u1', auctionId: 'a1' } },
        update: {},
        create: { userId: 'u1', auctionId: 'a1' }
      });
    });
  });

  describe('removeFromWatchlist', () => {
    it('should throw if item not in watchlist', async () => {
      prismaMock.watchlistItem.findUnique.mockResolvedValue(null);
      await expect(removeFromWatchlist('u1', 'a1')).rejects.toThrow('Not in watchlist');
    });

    it('should delete watchlist item', async () => {
      prismaMock.watchlistItem.findUnique.mockResolvedValue({ id: 'wl1' } as any);

      const res = await removeFromWatchlist('u1', 'a1');

      expect(prismaMock.watchlistItem.delete).toHaveBeenCalledWith({
        where: { userId_auctionId: { userId: 'u1', auctionId: 'a1' } }
      });
      expect(res.message).toBe('Removed from watchlist');
    });
  });
});
