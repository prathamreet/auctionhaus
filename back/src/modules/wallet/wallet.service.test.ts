/* eslint-disable @typescript-eslint/no-explicit-any */
import { getWallet, deposit, withdraw, getTransactions } from './wallet.service';
import { prismaMock } from '../../__mocks__/prisma';
import { m } from '../../__mocks__/money';

describe('Wallet Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWallet', () => {
    it('should return wallet with transactions', async () => {
      const mockWallet = { id: 'w1', userId: 'u1', balance: 1000, heldAmount: 0, transactions: [] };
      prismaMock.wallet.findUnique.mockResolvedValue(mockWallet as any);

      const res = await getWallet('u1');
      expect(res.id).toBe('w1');
      expect(prismaMock.wallet.findUnique).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'u1' },
        include: { transactions: expect.any(Object) }
      }));
    });

    it('should throw if not found', async () => {
      prismaMock.wallet.findUnique.mockResolvedValue(null);
      await expect(getWallet('u1')).rejects.toThrow('Wallet not found');
    });
  });

  describe('deposit', () => {
    it('should increment balance and create transaction', async () => {
      prismaMock.wallet.update.mockResolvedValue({ id: 'w1', balance: 1000 } as any);
      prismaMock.transaction.create.mockResolvedValue({ id: 't1' } as any);

      await deposit('u1', 500);

      // Phase A1: services pass Decimal; m() accepts either number or Decimal.
      expect(prismaMock.wallet.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { balance: { increment: m(500) } }
      });
      expect(prismaMock.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: 'DEPOSIT', amount: m(500) })
      }));
    });

    it('should throw if amount invalid', async () => {
      await expect(deposit('u1', -100)).rejects.toThrow('Amount must be positive');
      await expect(deposit('u1', 200000)).rejects.toThrow('Max single deposit is 100,000');
    });
  });

  describe('withdraw', () => {
    it('should decrement balance if sufficient funds', async () => {
      prismaMock.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 1000, heldAmount: 200 } as any);
      prismaMock.wallet.update.mockResolvedValue({ id: 'w1', balance: 500 } as any);

      await withdraw('u1', 500);

      expect(prismaMock.wallet.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { balance: { decrement: m(500) } }
      });
      expect(prismaMock.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: 'WITHDRAWAL', amount: m(-500) })
      }));
    });

    it('should throw if insufficient available balance', async () => {
      prismaMock.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 1000, heldAmount: 800 } as any); // available = 200

      await expect(withdraw('u1', 500)).rejects.toThrow('Insufficient available balance');
    });

    it('should throw if amount negative', async () => {
      await expect(withdraw('u1', -500)).rejects.toThrow('Amount must be positive');
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      prismaMock.wallet.findUnique.mockResolvedValue({ id: 'w1' } as any);
      prismaMock.transaction.findMany.mockResolvedValue([{ id: 't1' }] as any);
      prismaMock.transaction.count.mockResolvedValue(1);

      const res = await getTransactions('u1', 1, 10);
      expect(res.transactions.length).toBe(1);
      expect(res.total).toBe(1);
    });
  });
});
