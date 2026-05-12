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
      console.warn(`⚠️ [${name}] Redis connection error: ${err.message}. Real-time features may be degraded.`);
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
