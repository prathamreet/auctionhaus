import rateLimit from 'express-rate-limit';

// Limits are env-overridable. Production keeps the modest defaults; the k6
// throughput benchmark starts the backend with a very high RATE_LIMIT_MAX
// (e.g. RATE_LIMIT_MAX=100000000) so the global limiter does not reject the
// thousands of bids a load test fires from a single localhost IP and corrupt
// the latency/throughput numbers.
const GENERAL_MAX = parseInt(process.env.RATE_LIMIT_MAX || '', 10);
const STRICT_MAX = parseInt(process.env.RATE_LIMIT_STRICT_MAX || '', 10);

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number.isFinite(GENERAL_MAX) && GENERAL_MAX > 0 ? GENERAL_MAX : 1000,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.isFinite(STRICT_MAX) && STRICT_MAX > 0 ? STRICT_MAX : 100,
  message: 'Too many attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
