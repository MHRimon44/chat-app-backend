import type { RedisConnection } from '../infrastructure/redis.js';
import type { RateLimiter } from './ports.js';

export function createRedisRateLimiter(redis: RedisConnection): RateLimiter {
  return {
    async consume({ key, limit, windowSeconds }) {
      const result = await redis.consumeLimit(`rate:${key}`, windowSeconds);
      return {
        allowed: result.count <= limit,
        retryAfterSeconds: result.ttlSeconds,
      };
    },
  };
}
