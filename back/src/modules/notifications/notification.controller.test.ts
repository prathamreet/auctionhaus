jest.mock('../../index', () => ({ io: { to: jest.fn().mockReturnThis(), emit: jest.fn() } }));
jest.mock('./notification.service');

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request as _Request, Response as _Response, NextFunction as _NextFunction } from 'express';
import * as notificationController from './notification.controller';
import * as notificationService from './notification.service';

describe('Notification Controller', () => {
  let mockReq: any, mockRes: any, next: jest.Mock;

  beforeEach(() => {
    mockReq = { params: {}, body: {}, query: {}, user: { id: 'u1' } };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('getNotifications should return notifications', async () => {
    const result = { notifications: [] };
    (notificationService.getNotifications as jest.Mock).mockResolvedValue(result);
    await notificationController.getNotifications(mockReq, mockRes, next);
    expect(mockRes.json).toHaveBeenCalledWith(result);
  });
});
