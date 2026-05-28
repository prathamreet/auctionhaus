import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { D, neg, serializeMoney } from '../../lib/decimal';

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
  // Phase A1: convert balance / heldAmount / nested transactions[].amount
  // from Decimal to number so the API response shape stays number-typed.
  return serializeMoney(wallet);
};

/**
 * Mock deposit — simulates adding funds to wallet.
 */
export const deposit = async (userId: string, amount: number) => {
  if (amount <= 0) throw createError('Amount must be positive', 400);
  if (amount > 100000) throw createError('Max single deposit is 100,000', 400);
  const amountD = D(amount);

  const wallet = await prisma.wallet.update({
    where: { userId },
    data: { balance: { increment: amountD } },
  });

  await prisma.transaction.create({
    data: {
      walletId: wallet.id,
      userId,
      type: 'DEPOSIT',
      amount: amountD,
      description: 'Mock deposit',
      status: 'COMPLETED',
    },
  });

  return serializeMoney(wallet);
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
  const amountD = D(amount);

  const updated = await prisma.$transaction(async (tx) => {
    // Lock the wallet row. Empty result = wallet doesn't exist.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM wallets WHERE "userId" = ${userId} FOR UPDATE
    `;
    if (locked.length === 0) throw createError('Wallet not found', 404);

    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw createError('Wallet not found', 404);

    // Phase A1: Decimal-safe available-balance check.
    const available = D(wallet.balance).sub(wallet.heldAmount);
    if (available.lt(amountD)) throw createError('Insufficient available balance', 400);

    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: amountD } },
    });

    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: 'WITHDRAWAL',
        amount: neg(amountD),
        description: 'Mock withdrawal',
        status: 'COMPLETED',
      },
    });

    return updatedWallet;
  });

  return serializeMoney(updated);
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

  // Phase A1: Decimal amounts -> number for the API response.
  return { transactions: serializeMoney(transactions), total, page, limit };
};
