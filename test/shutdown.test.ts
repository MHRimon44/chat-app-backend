import { createServer } from 'node:http';

import { createShutdownHandler } from '../src/runtime/shutdown.js';
import { createSilentLogger } from './helpers.js';

describe('graceful shutdown', () => {
  it('is idempotent, closes HTTP first, and then closes dependencies', async () => {
    const events: string[] = [];
    const server = createServer((_request, response) => response.end('ok'));
    server.on('close', () => events.push('http'));

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const shutdown = createShutdownHandler({
      connections: [
        {
          disconnect: () => {
            events.push('dependency');
            return Promise.resolve();
          },
        },
      ],
      logger: createSilentLogger(),
      server,
      timeoutMs: 2_000,
    });

    const firstShutdown = shutdown('test');
    const secondShutdown = shutdown('duplicate');

    expect(secondShutdown).toBe(firstShutdown);
    await firstShutdown;
    expect(server.listening).toBe(false);
    expect(events).toEqual(['http', 'dependency']);
  });
});
