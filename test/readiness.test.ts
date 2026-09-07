import { createReadinessProbe } from '../src/health/readiness.js';

describe('readiness probe', () => {
  it('reports ready only when every required dependency responds', async () => {
    const probe = createReadinessProbe({
      mongo: { ping: () => Promise.resolve() },
      redis: { ping: () => Promise.resolve() },
    });

    await expect(probe.check()).resolves.toEqual({
      checks: { mongo: 'up', redis: 'up' },
      ready: true,
    });
  });

  it('reports individual dependency failure without returning the underlying error', async () => {
    const probe = createReadinessProbe({
      mongo: { ping: () => Promise.resolve() },
      redis: {
        ping: () => Promise.reject(new Error('redis://user:secret@internal-host')),
      },
    });

    await expect(probe.check()).resolves.toEqual({
      checks: { mongo: 'up', redis: 'down' },
      ready: false,
    });
  });
});
