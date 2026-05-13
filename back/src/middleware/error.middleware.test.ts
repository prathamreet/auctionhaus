import { errorHandler, createError, AppError } from './error.middleware';
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue } from 'zod';

describe('Error Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  const nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('createError', () => {
    it('should create an AppError with statusCode', () => {
      const err = createError('Not found', 404);
      expect(err.message).toBe('Not found');
      expect(err.statusCode).toBe(404);
      expect(err.isOperational).toBe(true);
    });
  });

  describe('errorHandler', () => {
    it('should format ZodErrors correctly', () => {
      const issues: ZodIssue[] = [
        { path: ['email'], message: 'Invalid email', code: 'custom' },
      ];
      const zodError = new ZodError(issues);

      errorHandler(zodError, mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Validation failed. Please check the highlighted fields.',
        errors: { email: 'Invalid email' }
      });
    });

    it('should handle standard AppErrors', () => {
      const err = createError('Forbidden', 403);

      errorHandler(err, mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Forbidden'
      }));
    });

    it('should fallback to 500 for generic errors', () => {
      const err = new Error('Generic failure');

      errorHandler(err as AppError, mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Generic failure'
      }));
    });
  });
});
