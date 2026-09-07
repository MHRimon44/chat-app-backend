export interface DependencyConnection {
  ping(): Promise<void>;
}

export type DependencyStatus = Readonly<{
  mongo: 'up' | 'down';
  redis: 'up' | 'down';
}>;

export type ReadinessResult = Readonly<{
  checks: DependencyStatus;
  ready: boolean;
}>;

export interface ReadinessProbe {
  check(): Promise<ReadinessResult>;
}

export function createReadinessProbe(options: {
  mongo: DependencyConnection;
  redis: DependencyConnection;
}): ReadinessProbe {
  return {
    async check() {
      const [mongoResult, redisResult] = await Promise.allSettled([
        options.mongo.ping(),
        options.redis.ping(),
      ]);
      const checks: DependencyStatus = {
        mongo: mongoResult.status === 'fulfilled' ? 'up' : 'down',
        redis: redisResult.status === 'fulfilled' ? 'up' : 'down',
      };

      return { checks, ready: checks.mongo === 'up' && checks.redis === 'up' };
    },
  };
}
