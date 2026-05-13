/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request as _Request, Response as _Response, NextFunction as _NextFunction } from 'express';
import * as walletController from './wallet.controller';
import * as walletService from './wallet.service';

jest.mock('./wallet.service');

describe('Wallet Controller', () => {
  let mockReq: any, mockRes: any, next: jest.Mock;

  beforeEach(() => {
    mockReq = { params: {}, body: {}, query: {}, user: { id: 'u1' } };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('getWallet should return wallet data', async () => {
    const wallet = { balance: 100 };
    (walletService.getWallet as jest.Mock).mockResolvedValue(wallet);
    await walletController.getWallet(mockReq, mockRes, next);
    expect(mockRes.json).toHaveBeenCalledWith(wallet);
  });
});
