/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request as _Request, Response as _Response, NextFunction as _NextFunction } from 'express';
import * as userController from './user.controller';
import * as userService from './user.service';

jest.mock('./user.service');

describe('User Controller', () => {
  let mockReq: any, mockRes: any, next: jest.Mock;

  beforeEach(() => {
    mockReq = { params: { id: 'u1' }, body: {}, query: {}, user: { id: 'u1' } };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('getUserProfile should return profile', async () => {
    const profile = { id: 'u1', name: 'Test' };
    (userService.getUserProfile as jest.Mock).mockResolvedValue(profile);
    await userController.getProfile(mockReq, mockRes, next);
    expect(mockRes.json).toHaveBeenCalledWith(profile);
  });
});
