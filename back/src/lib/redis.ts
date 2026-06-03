import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const retryStrategy = (times: number) => {
  if (times > 3) return 10000;
  return Math.min(times * 1000, 3000);
};

const handleRedisError = (name: string) => {
  let logged = false;
  return (err: Error) => {
    if (!logged) {
      console.warn(`[warn] [${name}] Redis connection error: ${err.message}. Real-time features may be degraded.`);
      logged = true;
    }
  };
};

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy,
});
redis.on('error', handleRedisError('RedisMain'));

// BullMQ requires plain connection options or an ioredis instance
export const bullMQConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy,
});
bullMQConnection.on('error', handleRedisError('BullMQ'));

export const redisPub = new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true, retryStrategy });
export const redisSub = new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true, retryStrategy });

redisPub.on('error', handleRedisError('RedisPub'));
redisSub.on('error', handleRedisError('RedisSub'));

// Phase A9.x: a DEDICATED subscriber for the cross-instance auth-cache
// invalidation channel ('user:invalidate'). It is deliberately NOT the
// Socket.io adapter's `redisSub` -- once a connection enters subscriber mode it
// can only run (un)subscribe commands, and piggy-backing our channel on the
// adapter's connection couples us to adapter internals (which channels/patterns
// it subscribes to, whether it emits 'message' vs 'pmessage'). A separate idle
// connection is cheap and keeps the two concerns independent. The publish side
// reuses the main `redis` connection (publishing doesn't require subscriber
// mode).
export const redisInvalidateSub = new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true, retryStrategy });
redisInvalidateSub.on('error', handleRedisError('RedisInvalidateSub'));
