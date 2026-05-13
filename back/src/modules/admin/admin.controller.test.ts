/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request as _Request, Response as _Response, NextFunction as _NextFunction } from 'express';
import * as adminController from './admin.controller';
import * as adminService from './admin.service';

jest.mock('./admin.service');

describe('Admin Controller', () => {
  let mockReq: any, mockRes: any, next: jest.Mock;

  beforeEach(() => {
    mockReq = { params: {}, body: {}, query: {} };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('getDashboardStats should return stats', async () => {
    const stats = { totalUsers: 10 };
    (adminService.getDashboardStats as jest.Mock).mockResolvedValue(stats);
    await adminController.getDashboard(mockReq, mockRes, next);
    expect(mockRes.json).toHaveBeenCalledWith(stats);
  });
});
