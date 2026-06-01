/* eslint-disable @typescript-eslint/no-explicit-any */
import { settleWithinTx } from './escrow.service';
import { prismaMock } from '../../__mocks__/prisma';
import { m } from '../../__mocks__/money';
import { Prisma, SettlementKind } from '@prisma/client';

describe('Escrow Service - settleWithinTx', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns alreadySettled without moving money when a Settlement row exists', async () => {
    (prismaMock.settlement.findUnique as any).mockResolvedValue({ amount: 250 });

    const res = await settleWithinTx(prismaMock as any, {
      auctionId: 'a1',
      auctionTitle: 'Rolex',
      payerId: 'u1',
      sellerId: 'u2',
      amount: 250,
      kind: SettlementKind.WON_AUCTION,
    });

    expect(res).toEqual({ alreadySettled: true, amount: 250 });
    expect(prismaMock.wallet.update).not.toHaveBeenCalled();
    expect(prismaMock.settlement.create).not.toHaveBeenCalled();
  });

  it('DIRECT_SALE debits payer balance, credits seller, writes ledger + Settlement', async () => {
    (prismaMock.settlement.findUnique as any).mockResolvedValue(null);
    prismaMock.wallet.findUnique
      .mockResolvedValueOnce({ id: 'w1', balance: 1000 } as any) // payer
      .mockResolvedValueOnce({ id: 'w2' } as any); // seller

    const res = await settleWithinTx(prismaMock as any, {
      auctionId: 'a1',
      auctionTitle: 'Rolex',
      payerId: 'u1',
      sellerId: 'u2',
      amount: 300,
      kind: SettlementKind.DIRECT_SALE,
    });

    expect(prismaMock.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { balance: { decrement: m(300) } },
    });
    expect(prismaMock.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'u2' },
      data: { balance: { increment: m(300) } },
    });
    expect(prismaMock.transaction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ type: 'PAYMENT', amount: m(-300), userId: 'u1' }),
        expect.objectContaining({ type: 'PAYMENT', amount: m(300), userId: 'u2' }),
      ]),
    });
    expect(prismaMock.settlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        auctionId: 'a1',
        sellerId: 'u2',
        partyId: 'u1',
        kind: 'DIRECT_SALE',
        amount: m(300),
      }),
    });
    expect(res).toEqual({ alreadySettled: false, amount: 300 });
  });

  it('WON_AUCTION releases payer heldAmount and credits seller balance (no balance check)', async () => {
    (prismaMock.settlement.findUnique as any).mockResolvedValue(null);
    prismaMock.wallet.findUnique
      .mockResolvedValueOnce({ id: 'w1' } as any) // payer -- no balance, held funds released
      .mockResolvedValueOnce({ id: 'w2' } as any); // seller

    await settleWithinTx(prismaMock as any, {
      auctionId: 'a1',
      auctionTitle: 'Rolex',
      payerId: 'u1',
      sellerId: 'u2',
      amount: 500,
      kind: SettlementKind.WON_AUCTION,
    });

    expect(prismaMock.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { heldAmount: { decrement: m(500) } },
    });
    expect(prismaMock.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'u2' },
      data: { balance: { increment: m(500) } },
    });
    expect(prismaMock.settlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'WON_AUCTION', amount: m(500) }),
    });
  });

  it('DIRECT_SALE throws and moves nothing when payer balance is insufficient', async () => {
    (prismaMock.settlement.findUnique as any).mockResolvedValue(null);
    prismaMock.wallet.findUnique.mockResolvedValueOnce({ id: 'w1', balance: 100 } as any); // payer

    await expect(
      settleWithinTx(prismaMock as any, {
        auctionId: 'a1',
        auctionTitle: 'Rolex',
        payerId: 'u1',
        sellerId: 'u2',
        amount: 300,
        kind: SettlementKind.DIRECT_SALE,
      })
    ).rejects.toThrow('Insufficient wallet balance');

    expect(prismaMock.wallet.update).not.toHaveBeenCalled();
    expect(prismaMock.settlement.create).not.toHaveBeenCalled();
  });

  it('translates a P2002 on the Settlement insert into alreadySettled without moving money', async () => {
    // A concurrent settle that slipped past the findUnique read (e.g. a future
    // caller that forgot the auction FOR UPDATE lock) hits the unique index on
    // insert. Because create() runs before any wallet update, the duplicate
    // path has nothing to unwind -- we return the idempotent result.
    (prismaMock.settlement.findUnique as any).mockResolvedValue(null);
    prismaMock.wallet.findUnique
      .mockResolvedValueOnce({ id: 'w1', balance: 1000 } as any) // payer
      .mockResolvedValueOnce({ id: 'w2' } as any); // seller
    (prismaMock.settlement.create as any).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      })
    );

    const res = await settleWithinTx(prismaMock as any, {
      auctionId: 'a1',
      auctionTitle: 'Rolex',
      payerId: 'u1',
      sellerId: 'u2',
      amount: 300,
      kind: SettlementKind.DIRECT_SALE,
    });

    expect(res).toEqual({ alreadySettled: true, amount: 300 });
    expect(prismaMock.wallet.update).not.toHaveBeenCalled();
    expect(prismaMock.transaction.createMany).not.toHaveBeenCalled();
  });
});
