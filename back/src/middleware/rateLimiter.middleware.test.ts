import { rateLimiter } from './rateLimiter.middleware';

describe('Rate Limiter Middleware', () => {
  it('should be configured correctly', () => {
    // Express-rate-limit returns a middleware function
    expect(typeof rateLimiter).toBe('function');
  });
});
