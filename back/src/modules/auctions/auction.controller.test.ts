/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request as _Request, Response as _Response, NextFunction as _NextFunction } from 'express';
import * as auctionController from './auction.controller';
import * as auctionService from './auction.service';

jest.mock('./auction.service');

describe('Auction Controller', () => {
  let mockReq: any, mockRes: any, next: jest.Mock;

  beforeEach(() => {
    mockReq = { params: {}, body: {}, query: {}, user: { id: 'u1' } };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('getAuctionById should return auction', async () => {
    mockReq.params.id = 'a1';
    const auction = { id: 'a1', title: 'Test' };
    (auctionService.getAuctionById as jest.Mock).mockResolvedValue(auction);
    await auctionController.getAuctionById(mockReq, mockRes, next);
    expect(mockRes.json).toHaveBeenCalledWith(auction);
  });
});
