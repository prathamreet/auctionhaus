import { Request, Response, NextFunction } from 'express';
import { register, login, getMe } from './auth.controller';
import * as authService from './auth.service';

jest.mock('./auth.service');

describe('Auth Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  const nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a user and return 201', async () => {
      mockRequest.body = {
        name: 'Test',
        email: 'test@test.com',
        password: 'password123'
      };

      const mockResult = { user: { id: '1', email: 'test@test.com' }, token: 'token' };
      (authService.register as jest.Mock).mockResolvedValue(mockResult);

      await register(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it('should call next with error if validation fails', async () => {
      mockRequest.body = { email: 'invalid' };

      await register(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(authService.register).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should login a user and return 200', async () => {
      mockRequest.body = {
        email: 'test@test.com',
        password: 'password123'
      };

      const mockResult = { user: { id: '1', email: 'test@test.com' }, token: 'token' };
      (authService.login as jest.Mock).mockResolvedValue(mockResult);

      await login(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('getMe', () => {
    it('should return current user', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockRequest = { user: { id: '1', email: 'test@test.com', role: 'USER' } } as any;
      
      const mockResult = { id: '1', email: 'test@test.com', name: 'Test' };
      (authService.getMe as jest.Mock).mockResolvedValue(mockResult);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await getMe(mockRequest as any, mockResponse as Response, nextFunction);

      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });
  });
});
