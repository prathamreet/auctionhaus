jest.mock('../../index', () => ({ io: { to: jest.fn().mockReturnThis(), emit: jest.fn() } }));
jest.mock('./auto-bid.service');

import { Response, NextFunction } from 'express';
import { setAutoBid, cancelAutoBid, getMyAutoBid } from './auto-bid.controller';
import * as autoBidService from './auto-bid.service';

describe('AutoBid Controller', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRequest: any;
  let mockResponse: Partial<Response>;
  const nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    mockRequest = {
      params: { auctionId: 'a1' },
      user: { id: 'u1' },
    };
    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('setAutoBid', () => {
    it('should validate maxAmount and set auto-bid, returning 201', async () => {
      mockRequest.body = { maxAmount: 500 };
      const mockResult = { id: 'ab1', maxAmount: 500 };
      (autoBidService.setAutoBid as jest.Mock).mockResolvedValue(mockResult);

      await setAutoBid(mockRequest, mockResponse as Response, nextFunction);

      expect(autoBidService.setAutoBid).toHaveBeenCalledWith({
        auctionId: 'a1',
        bidderId: 'u1',
        maxAmount: 500,
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it('should call next with error if maxAmount is missing or negative', async () => {
      mockRequest.body = { maxAmount: -50 };

      await setAutoBid(mockRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(autoBidService.setAutoBid).not.toHaveBeenCalled();
    });
  });

  describe('cancelAutoBid', () => {
    it('should cancel auto-bid and return message', async () => {
      const mockResult = { message: 'Auto-bid cancelled' };
      (autoBidService.cancelAutoBid as jest.Mock).mockResolvedValue(mockResult);

      await cancelAutoBid(mockRequest, mockResponse as Response, nextFunction);

      expect(autoBidService.cancelAutoBid).toHaveBeenCalledWith('a1', 'u1');
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('getMyAutoBid', () => {
    it('should return auto-bid if it exists', async () => {
      const mockResult = { id: 'ab1' };
      (autoBidService.getMyAutoBid as jest.Mock).mockResolvedValue(mockResult);

      await getMyAutoBid(mockRequest, mockResponse as Response, nextFunction);

      expect(autoBidService.getMyAutoBid).toHaveBeenCalledWith('a1', 'u1');
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return null if auto-bid does not exist', async () => {
      (autoBidService.getMyAutoBid as jest.Mock).mockResolvedValue(null);

      await getMyAutoBid(mockRequest, mockResponse as Response, nextFunction);

      expect(mockResponse.json).toHaveBeenCalledWith(null);
    });
  });
});
