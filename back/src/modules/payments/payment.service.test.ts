/* eslint-disable @typescript-eslint/no-explicit-any */
import { confirmWinnerPayment } from './payment.service';
import { prismaMock } from '../../__mocks__/prisma';
import { m } from '../../__mocks__/money';
import { notifyUser } from '../notifications/notification.service';

jest.mock('../notifications/notification.service', () => ({
  notifyUser: jest.fn(),
}));

describe('Payment Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  });

  describe('confirmWinnerPayment', () => {
    const defaultAuction = {
      id: 'a1',
      sellerId: 'u2',
      winnerId: 'u1',
      status: 'ENDED',
      title: 'Test Auction',
      seller: { name: 'SellerName' }
    } as any;

    it('should throw if auction not found', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(null);
      await expect(confirmWinnerPayment('a1', 'u1')).rejects.toThrow('Auction not found');
    });

    it('should throw if user is not the winner', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ ...defaultAuction, winnerId: 'u3' });
      await expect(confirmWinnerPayment('a1', 'u1')).rejects.toThrow('You did not win this auction');
    });

    it('should throw if auction is not ended', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({ ...defaultAuction, status: 'ACTIVE' });
      await expect(confirmWinnerPayment('a1', 'u1')).rejects.toThrow('Auction has not ended');
    });

    it('should return immediately if payment already confirmed', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      // Phase A5: idempotency is the Settlement row, not an existing PAYMENT
      // transaction. Settlement.amount is the positive sale amount.
      (prismaMock.settlement.findUnique as any).mockResolvedValue({ amount: 100 });

      const res = await confirmWinnerPayment('a1', 'u1');

      expect((res as any).alreadyProcessed).toBe(true);
      expect(res.amount).toBe(100);
      expect(prismaMock.wallet.update).not.toHaveBeenCalled();
    });

    it('should process payment transaction successfully', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      (prismaMock.settlement.findUnique as any).mockResolvedValue(null); // not settled yet
      prismaMock.bid.findFirst.mockResolvedValue({ id: 'b1', amount: 500 } as any);
      
      const winnerWallet = { id: 'w1', userId: 'u1' };
      const sellerWallet = { id: 'w2', userId: 'u2' };
      
      // Mock wallet lookups sequentially
      prismaMock.wallet.findUnique
        .mockResolvedValueOnce(winnerWallet as any)
        .mockResolvedValueOnce(sellerWallet as any);

      const res = await confirmWinnerPayment('a1', 'u1');

      // Check Winner Wallet Deduction (only heldAmount is decremented since balance was decremented at bid time)
      expect(prismaMock.wallet.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { heldAmount: { decrement: m(500) } }
      });

      // Check Seller Wallet Credit
      expect(prismaMock.wallet.update).toHaveBeenCalledWith({
        where: { userId: 'u2' },
        data: { balance: { increment: m(500) } }
      });

      // Check Transactions Created -- amounts pass through as Decimal post A1.
      expect(prismaMock.transaction.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ type: 'PAYMENT', amount: m(-500), userId: 'u1' }),
          expect.objectContaining({ type: 'PAYMENT', amount: m(500), userId: 'u2' }),
        ])
      });

      // Check bid update
      expect(prismaMock.bid.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { status: 'WON' }
      });

      // Check notification
      expect(notifyUser).toHaveBeenCalledWith('u2', expect.objectContaining({ type: 'PAYMENT_RECEIVED' }));

      // Check response
      expect(res.message).toBe('Payment confirmed');
      expect(res.amount).toBe(500);
      expect((res as any).seller).toBe('SellerName');
    });

    it('should throw if winning bid not found', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(defaultAuction);
      (prismaMock.settlement.findUnique as any).mockResolvedValue(null);
      prismaMock.bid.findFirst.mockResolvedValue(null);

      await expect(confirmWinnerPayment('a1', 'u1')).rejects.toThrow('Winning bid not found');
    });
  });
});
