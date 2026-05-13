/* eslint-disable @typescript-eslint/no-explicit-any */
import { getUserProfile, updateProfile, getBidHistory, getMyAuctions, getWonAuctions, rateUser } from './user.service';
import { prismaMock } from '../../__mocks__/prisma';

describe('User Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    it('should return user profile if found', async () => {
      const mockProfile = { id: 'u1', name: 'Test', _count: { auctions: 5 } };
      prismaMock.user.findUnique.mockResolvedValue(mockProfile as any);

      const res = await getUserProfile('u1');
      expect(res).toEqual(mockProfile);
    });

    it('should throw if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(getUserProfile('u1')).rejects.toThrow('User not found');
    });
  });

  describe('updateProfile', () => {
    it('should update and return profile', async () => {
      const mockUpdate = { id: 'u1', name: 'New Name' };
      prismaMock.user.update.mockResolvedValue(mockUpdate as any);

      const res = await updateProfile('u1', { name: 'New Name' });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'New Name' },
        select: expect.any(Object),
      });
      expect(res).toEqual(mockUpdate);
    });
  });

  describe('getBidHistory', () => {
    it('should return user bid history', async () => {
      prismaMock.bid.findMany.mockResolvedValue([{ id: 'b1' }] as any);
      const res = await getBidHistory('u1');
      expect(prismaMock.bid.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { bidderId: 'u1' }
      }));
      expect(res).toHaveLength(1);
    });
  });

  describe('getMyAuctions', () => {
    it('should return auctions created by user', async () => {
      prismaMock.auction.findMany.mockResolvedValue([{ id: 'a1' }] as any);
      const res = await getMyAuctions('u1');
      expect(prismaMock.auction.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { sellerId: 'u1' }
      }));
      expect(res).toHaveLength(1);
    });
  });

  describe('getWonAuctions', () => {
    it('should return auctions won by user', async () => {
      prismaMock.auction.findMany.mockResolvedValue([{ id: 'a1' }] as any);
      const res = await getWonAuctions('u1');
      expect(prismaMock.auction.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { winnerId: 'u1' }
      }));
      expect(res).toHaveLength(1);
    });
  });

  describe('rateUser', () => {
    it('should throw if rating self', async () => {
      await expect(rateUser({ raterId: 'u1', rateeId: 'u1', auctionId: 'a1', score: 5 })).rejects.toThrow("Can't rate yourself");
    });

    it('should throw if score is out of bounds', async () => {
      await expect(rateUser({ raterId: 'u1', rateeId: 'u2', auctionId: 'a1', score: 6 })).rejects.toThrow('Score must be 1-5');
      await expect(rateUser({ raterId: 'u1', rateeId: 'u2', auctionId: 'a1', score: 0 })).rejects.toThrow('Score must be 1-5');
    });

    it('should throw if already rated for this auction', async () => {
      prismaMock.rating.findUnique.mockResolvedValue({ id: 'r1' } as any);
      await expect(rateUser({ raterId: 'u1', rateeId: 'u2', auctionId: 'a1', score: 4 })).rejects.toThrow('Already rated this user for this auction');
    });

    it('should create rating and update user averages', async () => {
      prismaMock.rating.findUnique.mockResolvedValue(null);
      prismaMock.rating.create.mockResolvedValue({ id: 'r1' } as any);
      prismaMock.rating.aggregate.mockResolvedValue({
        _avg: { score: 4.5 },
        _count: { score: 2 }
      } as any);

      await rateUser({ raterId: 'u1', rateeId: 'u2', auctionId: 'a1', score: 5 });

      expect(prismaMock.rating.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ raterId: 'u1', rateeId: 'u2', score: 5 })
      });
      expect(prismaMock.rating.aggregate).toHaveBeenCalledWith({
        where: { rateeId: 'u2' },
        _avg: { score: true },
        _count: { score: true }
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u2' },
        data: { rating: 4.5, ratingCount: 2 }
      });
    });
  });
});
