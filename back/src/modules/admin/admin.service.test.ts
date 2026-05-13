/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDashboardStats, getAllUsers, suspendUser, getAllAuctions, moderateAuction, getFraudFlags } from './admin.service';
import { prismaMock } from '../../__mocks__/prisma';

describe('Admin Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardStats', () => {
    it('should aggregate and return dashboard metrics', async () => {
      prismaMock.user.count.mockResolvedValue(10);
      prismaMock.auction.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2); // total, active
      prismaMock.bid.count.mockResolvedValue(100);
      prismaMock.transaction.aggregate.mockResolvedValue({ _sum: { amount: 5000 } } as any);
      prismaMock.user.findMany.mockResolvedValue([{ id: 'u1' }] as any);
      prismaMock.auction.findMany.mockResolvedValue([{ id: 'a1' }] as any);

      const res = await getDashboardStats();

      expect(res.totalUsers).toBe(10);
      expect(res.totalAuctions).toBe(5);
      expect(res.activeAuctions).toBe(2);
      expect(res.totalBids).toBe(100);
      expect(res.totalRevenue).toBe(5000);
      expect(res.recentUsers).toHaveLength(1);
      expect(res.recentAuctions).toHaveLength(1);
    });
  });

  describe('getAllUsers', () => {
    it('should return paginated users', async () => {
      prismaMock.user.findMany.mockResolvedValue([{ id: 'u1' }] as any);
      prismaMock.user.count.mockResolvedValue(1);

      const res = await getAllUsers({ page: 1, limit: 10 });
      expect(res.users).toHaveLength(1);
      expect(res.total).toBe(1);
    });
  });

  describe('suspendUser', () => {
    it('should throw if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(suspendUser('u1', true)).rejects.toThrow('User not found');
    });

    it('should throw if trying to suspend admin', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' } as any);
      await expect(suspendUser('u1', true)).rejects.toThrow('Cannot suspend admin');
    });

    it('should update user suspension status', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'USER' } as any);
      prismaMock.user.update.mockResolvedValue({ id: 'u1', isSuspended: true } as any);

      const res = await suspendUser('u1', true);
      expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'u1' },
        data: { isSuspended: true }
      }));
      expect(res.isSuspended).toBe(true);
    });
  });

  describe('getAllAuctions', () => {
    it('should return paginated auctions', async () => {
      prismaMock.auction.findMany.mockResolvedValue([{ id: 'a1' }] as any);
      prismaMock.auction.count.mockResolvedValue(1);

      const res = await getAllAuctions({ page: 1, limit: 10 });
      expect(res.auctions).toHaveLength(1);
      expect(res.total).toBe(1);
    });
  });

  describe('moderateAuction', () => {
    it('should throw if auction not found', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(null);
      await expect(moderateAuction('a1', 'cancel')).rejects.toThrow('Auction not found');
    });

    it('should update auction status', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ id: 'a1' } as any);
      prismaMock.auction.update.mockResolvedValue({ id: 'a1', status: 'CANCELLED' } as any);

      await moderateAuction('a1', 'cancel');

      expect(prismaMock.auction.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'a1' },
        data: { status: 'CANCELLED' }
      }));
    });
  });

  describe('getFraudFlags', () => {
    it('should detect suspicious bidders', async () => {
      const mockGroupBy = [{ bidderId: 'u1', _count: { id: 15 } }];
      (prismaMock.bid.groupBy as unknown as jest.Mock).mockResolvedValue(mockGroupBy as any);
      prismaMock.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Sus User' }] as any);

      const res = await getFraudFlags();

      expect(res).toHaveLength(1);
      expect(res[0].outbidCount).toBe(15);
      expect(res[0].user?.name).toBe('Sus User');
    });
  });
});
