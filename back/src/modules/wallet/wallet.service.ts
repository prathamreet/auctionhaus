import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';

export const getWallet = async (userId: string) => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });
  if (!wallet) throw createError('Wallet not found', 404);
  return wallet;
};

/**
 * Mock deposit — simulates adding funds to wallet.
 */
export const deposit = async (userId: string, amount: number) => {
  if (amount <= 0) throw createError('Amount must be positive', 400);
  if (amount > 100000) throw createError('Max single deposit is 100,000', 400);

  const wallet = await prisma.wallet.update({
    where: { userId },
    data: { balance: { increment: amount } },
  });

  await prisma.transaction.create({
    data: {
      walletId: wallet.id,
      userId,
      type: 'DEPOSIT',
      amount,
      description: 'Mock deposit',
      status: 'COMPLETED',
    },
  });

  return wallet;
};

/**
 * Mock withdrawal.
 */
export const withdraw = async (userId: string, amount: number) => {
  if (amount <= 0) throw createError('Amount must be positive', 400);

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw createError('Wallet not found', 404);

  const available = wallet.balance - wallet.heldAmount;
  if (available < amount) throw createError('Insufficient available balance', 400);

  const updatedWallet = await prisma.wallet.update({
    where: { userId },
    data: { balance: { decrement: amount } },
  });

  await prisma.transaction.create({
    data: {
      walletId: wallet.id,
      userId,
      type: 'WITHDRAWAL',
      amount: -amount,
      description: 'Mock withdrawal',
      status: 'COMPLETED',
    },
  });

  return updatedWallet;
};

export const getTransactions = async (userId: string, page = 1, limit = 20) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw createError('Wallet not found', 404);

  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.transaction.count({ where: { userId } }),
  ]);

  return { transactions, total, page, limit };
};
