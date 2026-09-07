import type { Logger } from 'pino';
import { createClient, type RedisClientType } from 'redis';

import type { ApiConfig } from '../config/env.js';

export interface RedisConnection {
  connect(): Promise<void>;
  consumeLimit(key: string, windowSeconds: number): Promise<{ count: number; ttlSeconds: number }>;
  disconnect(): Promise<void>;
  ping(): Promise<void>;
}

export function createRedisConnection(
  config: Pick<ApiConfig, 'redisConnectTimeoutMs' | 'redisUrl'>,
  logger: Logger,
): RedisConnection {
  const client: RedisClientType = createClient({
    socket: {
      connectTimeout: config.redisConnectTimeoutMs,
      reconnectStrategy(retries) {
        return Math.min(100 * 2 ** retries, 3_000);
      },
    },
    url: config.redisUrl,
  });

  client.on('error', (error: Error) => {
    logger.error({ err: error }, 'Redis client error');
  });

  return {
    async connect() {
      if (!client.isOpen) await client.connect();
      logger.info('Redis connection established');
    },
    async consumeLimit(key, windowSeconds) {
      if (!client.isReady) throw new Error('Redis is not ready.');
      const result = (await client.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return {count, redis.call('TTL', KEYS[1])}",
        { keys: [key], arguments: [String(windowSeconds)] },
      )) as [number, number];
      return { count: Number(result[0]), ttlSeconds: Math.max(1, Number(result[1])) };
    },
    async disconnect() {
      if (client.isOpen) {
        await client.quit();
        logger.info('Redis connection closed');
      }
    },
    async ping() {
      if (!client.isReady) throw new Error('Redis is not ready.');
      await client.ping();
    },
  };
}
