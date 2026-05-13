/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request as _Request, Response as _Response, NextFunction as _NextFunction } from 'express';
import * as paymentController from './payment.controller';
import * as paymentService from './payment.service';

jest.mock('./payment.service');

describe('Payment Controller', () => {
  let mockReq: any, mockRes: any, next: jest.Mock;

  beforeEach(() => {
    mockReq = { params: { auctionId: 'a1' }, body: {}, query: {}, user: { id: 'u1' } };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('confirmWinnerPayment should confirm and return 200', async () => {
    const result = { message: 'Success' };
    (paymentService.confirmWinnerPayment as jest.Mock).mockResolvedValue(result);
    await paymentController.confirmPayment(mockReq, mockRes, next);
    expect(mockRes.json).toHaveBeenCalledWith(result);
  });
});
