import { authenticate, requireAdmin, AuthRequest, invalidateUser } from './auth.middleware';
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prismaMock } from '../__mocks__/prisma';

jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  const nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    mockRequest = { headers: {} };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    invalidateUser('u1');
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should return 401 if no token provided', async () => {
      await authenticate(mockRequest as AuthRequest, mockResponse as Response, nextFunction);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'No token provided' });
    });

    it('should return 401 if invalid token', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid' };
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error(); });
      
      await authenticate(mockRequest as AuthRequest, mockResponse as Response, nextFunction);
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
    });

    it('should return 401 if user not found', async () => {
      mockRequest.headers = { authorization: 'Bearer valid' };
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'u1' });
      prismaMock.user.findUnique.mockResolvedValue(null);

      await authenticate(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'User not found' });
    });

    it('should return 403 if user is suspended', async () => {
      mockRequest.headers = { authorization: 'Bearer valid' };
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'u1' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', isSuspended: true } as any);

      await authenticate(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Account suspended' });
    });

    it('should call next and set req.user if valid', async () => {
      mockRequest.headers = { authorization: 'Bearer valid' };
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'u1' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'test@t.com', role: 'USER', isSuspended: false } as any);

      await authenticate(mockRequest as AuthRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toEqual({ id: 'u1', email: 'test@t.com', role: 'USER' });
    });
  });

  describe('requireAdmin', () => {
    it('should return 403 if user is not admin', () => {
      mockRequest.user = { id: 'u1', email: 'test@t.com', role: 'USER' };
      requireAdmin(mockRequest as AuthRequest, mockResponse as Response, nextFunction);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should call next if user is admin', () => {
      mockRequest.user = { id: 'u1', email: 'test@t.com', role: 'ADMIN' };
      requireAdmin(mockRequest as AuthRequest, mockResponse as Response, nextFunction);
      expect(nextFunction).toHaveBeenCalled();
    });
  });
});
