/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Phase A6 — atomic auto-bid ladder smoke tests + the existing
// initWorkers boot-sanity check.
//
// The ladder logic is the headline behavior of A6 and deserves regression
// coverage per branch:
//   1. No competing auto-bids => empty ladder.
//   2. One competing auto-bidder => exactly one ladder step at
//      currentPrice + minIncrement (the per-step UX contract).
//   3. An auto-bidder priced just below the next rung gets deactivated.
//   4. Non-English auctions short-circuit (Dutch / Sealed have their own flows).
//
// We mock the side-effect imports of `workers/index.ts` (the socket `io`
// from `../index`, and `notifyUser`) so importing the module doesn't try
// to spin up the live server. BullMQ Queue/Worker is already globally
// mocked from `src/__tests__/setup.ts`.

jest.mock('../index', () => ({
  io: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
}));
jest.mock('../modules/notifications/notification.service', () => ({
  notifyUser: jest.fn(),
}));

import { initWorkers, processAutoBidLadder } from './index';
import { prismaMock } from '../__mocks__/prisma';
import { m } from '../__mocks__/money';
import { AuctionStatus, AuctionType } from '@prisma/client';

describe('Workers', () => {
  it('should initialize without errors', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    initWorkers();
    expect(consoleSpy).toHaveBeenCalledWith('BullMQ workers initialized');
    consoleSpy.mockRestore();
  });
});

describe('processAutoBidLadder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const englishAuction = {
    id: 'a1',
    type: AuctionType.ENGLISH,
    status: AuctionStatus.ACTIVE,
    currentPrice: 100,
    minIncrement: 10,
    title: 'X',
  };

  it('returns no steps when the auto-bid pool is empty', async () => {
    prismaMock.auction.findUnique.mockResolvedValue(englishAuction as any);
    prismaMock.autoBid.findMany.mockResolvedValue([]);

    const steps = await processAutoBidLadder('a1', 'trigger');

    expect(steps).toEqual([]);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('produces one ladder step at currentPrice + minIncrement when a single auto-bidder can outbid', async () => {
    prismaMock.auction.findUnique.mockResolvedValue(englishAuction as any);
    prismaMock.autoBid.findMany.mockResolvedValue([
      { id: 'ab1', bidderId: 'auto1', maxAmount: 500 },
    ] as any);
    // Trigger bid that's currently WINNING (about to be OUTBID by the ladder).
    prismaMock.bid.findFirst.mockResolvedValue({
      id: 'trigBid',
      bidderId: 'trigger',
      amount: 100,
    } as any);
    // Challenger wallet -- plenty of funds.
    prismaMock.wallet.findUnique.mockResolvedValue({
      id: 'wAuto1',
      userId: 'auto1',
      balance: 1000,
      heldAmount: 0,
    } as any);
    prismaMock.bid.create.mockResolvedValue({
      id: 'newBid1',
      auctionId: 'a1',
      bidderId: 'auto1',
      amount: 110,
      createdAt: new Date('2026-05-28T00:00:00Z'),
    } as any);

    const steps = await processAutoBidLadder('a1', 'trigger');

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      bidId: 'newBid1',
      bidderId: 'auto1',
      amount: 110,
    });

    // Verify the new bid was created at exactly currentPrice + minIncrement
    // (the per-step UX contract -- NOT min(beatingAmount, top.maxAmount)).
    expect(prismaMock.bid.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auctionId: 'a1',
          bidderId: 'auto1',
          amount: m(110),
          status: 'WINNING',
          isAutoBid: true,
        }),
      }),
    );

    // currentPrice should advance to the last ladder rung.
    expect(prismaMock.auction.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { currentPrice: m(110) },
    });
  });

  it('deactivates an auto-bid whose available balance cannot cover the next rung', async () => {
    prismaMock.auction.findUnique.mockResolvedValue(englishAuction as any);
    prismaMock.autoBid.findMany.mockResolvedValue([
      { id: 'ab1', bidderId: 'auto1', maxAmount: 500 },
    ] as any);
    prismaMock.bid.findFirst.mockResolvedValue({
      id: 'trigBid',
      bidderId: 'trigger',
      amount: 100,
    } as any);
    // Wallet too poor to pay 110 (heldAmount nearly equals balance).
    prismaMock.wallet.findUnique.mockResolvedValue({
      id: 'wAuto1',
      userId: 'auto1',
      balance: 200,
      heldAmount: 195, // available = 5; cannot afford 110
    } as any);

    const steps = await processAutoBidLadder('a1', 'trigger');

    expect(steps).toEqual([]);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
    expect(prismaMock.autoBid.update).toHaveBeenCalledWith({
      where: { id: 'ab1' },
      data: { isActive: false },
    });
  });

  it('no-ops for non-English auctions (Dutch / Sealed have their own flows)', async () => {
    prismaMock.auction.findUnique.mockResolvedValue({
      ...englishAuction,
      type: AuctionType.SEALED_BID,
    } as any);

    const steps = await processAutoBidLadder('a1', 'trigger');

    expect(steps).toEqual([]);
    // autoBid.findMany should not even be queried.
    expect(prismaMock.autoBid.findMany).not.toHaveBeenCalled();
  });
});
