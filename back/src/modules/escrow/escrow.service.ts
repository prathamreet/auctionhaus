import { Prisma, SettlementKind } from '@prisma/client';
import { createError } from '../../middleware/error.middleware';
import { D, toNum } from '../../lib/decimal';

/**
 * Phase A5: the single money-settlement path shared by buyNow (DIRECT_SALE)
 * and confirmWinnerPayment (WON_AUCTION). Before A5 these two flows hand-rolled
 * the same buyer->seller transfer + paired PAYMENT ledger rows, with two
 * different ad-hoc idempotency guards (buyNow leaned on the ENDED status flip,
 * confirm looked for an existing PAYMENT transaction). They are now one path.
 *
 * Runs INSIDE the caller's transaction. The caller MUST have already locked the
 * auction row FOR UPDATE (global lock-order: auction first, then wallets). This
 * function locks the two wallet rows in ascending userId order, moves the money
 * per `kind`, writes the paired PAYMENT ledger rows, and inserts the Settlement
 * row (uniqued on auctionId) that makes settlement idempotent.
 *
 * Idempotency: if a Settlement row already exists for the auction -- a retried
 * call, or a concurrent one that lost the row-lock race -- we return
 * { alreadySettled: true } WITHOUT moving money again.
 *
 * Money mechanics by kind:
 *  - DIRECT_SALE (buyNow): payer.balance -= amount; seller.balance += amount.
 *    The payer's spendable balance must cover the amount (checked here).
 *  - WON_AUCTION (confirmWinnerPayment): payer.heldAmount -= amount;
 *    seller.balance += amount. The payer's balance was already moved into
 *    heldAmount when the winning bid was placed, so there is no balance check
 *    -- the funds are already held, we just release them to the seller.
 */
export const settleWithinTx = async (
  tx: Prisma.TransactionClient,
  params: {
    auctionId: string;
    auctionTitle: string;
    payerId: string; // buyer (DIRECT_SALE) or winner (WON_AUCTION)
    sellerId: string;
    amount: Prisma.Decimal | number;
    kind: SettlementKind;
  }
): Promise<{ alreadySettled: boolean; amount: number }> => {
  const { auctionId, auctionTitle, payerId, sellerId, kind } = params;
  const amountD = D(params.amount);

  // Idempotency guard: one settlement per auction, full stop.
  const existing = await tx.settlement.findUnique({ where: { auctionId } });
  if (existing) {
    return { alreadySettled: true, amount: toNum(D(existing.amount)) ?? 0 };
  }

  // Lock both wallet rows in ascending userId order. The auction is already
  // locked by the caller; wallets come next in the global lock-order, sorted
  // so any two settlements touching the same pair acquire in the same order.
  for (const uid of [payerId, sellerId].sort()) {
    await tx.$queryRaw`SELECT id FROM wallets WHERE "userId" = ${uid} FOR UPDATE`;
  }

  const payerWallet = await tx.wallet.findUnique({ where: { userId: payerId } });
  if (!payerWallet) throw createError('Payer wallet not found', 404);

  const isDirect = kind === SettlementKind.DIRECT_SALE;

  if (isDirect && D(payerWallet.balance).lt(amountD)) {
    throw createError('Insufficient wallet balance', 400);
  }

  const sellerWallet = await tx.wallet.findUnique({ where: { userId: sellerId } });
  if (!sellerWallet) throw createError('Seller wallet not found', 404);

  // Write the idempotency row FIRST, before any money moves. The findUnique
  // early-out above is the fast path; this insert is the authoritative guard.
  // If a concurrent settle slipped past the read (e.g. a future caller that
  // forgot to take the auction FOR UPDATE lock that serializes us), the unique
  // index on auctionId rejects the second insert with P2002 -- we translate
  // that into the same idempotent "already settled" result rather than letting
  // a raw constraint error surface as a 500. Crucially, because no wallet has
  // been touched yet, the duplicate path has nothing to unwind.
  try {
    await tx.settlement.create({
      data: { auctionId, sellerId, partyId: payerId, amount: amountD, kind },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { alreadySettled: true, amount: toNum(amountD) ?? 0 };
    }
    throw err;
  }

  // Debit the payer. DIRECT_SALE comes out of spendable balance; WON_AUCTION
  // releases the already-held funds.
  await tx.wallet.update({
    where: { userId: payerId },
    data: isDirect
      ? { balance: { decrement: amountD } }
      : { heldAmount: { decrement: amountD } },
  });

  // Credit the seller's spendable balance.
  await tx.wallet.update({
    where: { userId: sellerId },
    data: { balance: { increment: amountD } },
  });

  await tx.transaction.createMany({
    data: [
      {
        walletId: payerWallet.id,
        userId: payerId,
        type: 'PAYMENT',
        amount: amountD.neg(),
        description: `${isDirect ? 'Buy Now' : 'Won auction'}: ${auctionTitle}`,
        referenceId: auctionId,
        status: 'COMPLETED',
      },
      {
        walletId: sellerWallet.id,
        userId: sellerId,
        type: 'PAYMENT',
        amount: amountD,
        description: `${isDirect ? 'Sale' : 'Sold'}: ${auctionTitle}`,
        referenceId: auctionId,
        status: 'COMPLETED',
      },
    ],
  });

  return { alreadySettled: false, amount: toNum(amountD) ?? 0 };
};
