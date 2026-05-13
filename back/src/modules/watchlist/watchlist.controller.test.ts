/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request as _Request, Response as _Response, NextFunction as _NextFunction } from 'express';
import * as watchlistController from './watchlist.controller';
import * as watchlistService from './watchlist.service';

jest.mock('./watchlist.service');

describe('Watchlist Controller', () => {
  let mockReq: any, mockRes: any, next: jest.Mock;

  beforeEach(() => {
    mockReq = { params: {}, body: { auctionId: 'a1' }, query: {}, user: { id: 'u1' } };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('getWatchlist should return items', async () => {
    const items = [{ id: 'w1' }];
    (watchlistService.getWatchlist as jest.Mock).mockResolvedValue(items);
    await watchlistController.getWatchlist(mockReq, mockRes, next);
    expect(mockRes.json).toHaveBeenCalledWith({ watchlist: items });
  });
});
