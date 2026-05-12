import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for dev/testing
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Increased for dev/testing
  message: 'Too many attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
