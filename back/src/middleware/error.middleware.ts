import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError | ZodError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  }

  // Handle Zod validation errors — return structured per-field errors
  if (err instanceof ZodError) {
    const errors: Record<string, string> = {};
    for (const issue of err.issues) {
      const field = issue.path.join('.');
      if (!errors[field]) errors[field] = issue.message;
    }
    res.status(422).json({
      message: 'Validation failed. Please check the highlighted fields.',
      errors,
    });
    return;
  }

  const appErr = err as AppError;
  const statusCode = appErr.statusCode || 500;
  const message = appErr.message || 'Internal Server Error';

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: appErr.stack }),
  });
};

export const createError = (message: string, statusCode: number): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};
