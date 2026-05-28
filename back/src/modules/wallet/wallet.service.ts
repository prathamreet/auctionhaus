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
 *
 * Phase A2: pessimistic-locked. Two concurrent withdrawals on the same wallet
 * used to both read `available = balance - heldAmount`, both pass the check,
 * and both proceed to decrement -- effectively letting a user withdraw twice.
 * Now the wallet row is FOR UPDATE locked inside a transaction so the second
 * request waits for the first to commit and re-reads the post-decrement state.
 */
export const withdraw = async (userId: string, amount: number) => {
  if (amount <= 0) throw createError('Amount must be positive', 400);

  return prisma.$transaction(async (tx) => {
    // Lock the wallet row. Empty result = wallet doesn't exist.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM wallets WHERE "userId" = ${userId} FOR UPDATE
    `;
    if (locked.length === 0) throw createError('Wallet not found', 404);

    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw createError('Wallet not found', 404);

    const available = wallet.balance - wallet.heldAmount;
    if (available < amount) throw createError('Insufficient available balance', 400);

    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });

    await tx.transaction.create({
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
  });
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
