jest.mock('../../index', () => ({ io: { to: jest.fn().mockReturnThis(), emit: jest.fn() } }));
// Phase A6: bid.controller no longer imports from auto-bid.service. The
// previous `processAutoBids` jest.mock here was dead; removed.
jest.mock('./bid.service');

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request as _Request, Response as _Response, NextFunction as _NextFunction } from 'express';
import * as bidController from './bid.controller';
import * as bidService from './bid.service';

describe('Bid Controller', () => {
  let mockReq: any, mockRes: any, next: jest.Mock;

  beforeEach(() => {
    mockReq = { params: { auctionId: 'a1' }, body: { amount: 100 }, user: { id: 'u1' } };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('placeBid should place a bid and return 201', async () => {
    const bid = { id: 'b1', amount: 100 };
    (bidService.placeBid as jest.Mock).mockResolvedValue(bid);
    await bidController.placeBid(mockReq, mockRes, next);
    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith(bid);
  });
});
