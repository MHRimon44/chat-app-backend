import type { Server } from 'node:http';

import type { Logger } from 'pino';

export interface CloseableConnection {
  disconnect(): Promise<void>;
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function createShutdownHandler(options: {
  connections: readonly CloseableConnection[];
  logger: Logger;
  server: Server;
  timeoutMs: number;
}): (reason: string) => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;

  return (reason: string) => {
    shutdownPromise ??= (async () => {
      options.logger.info({ reason }, 'Graceful shutdown started');

      const gracefulClose = (async () => {
        await closeHttpServer(options.server);
        const results = await Promise.allSettled(
          options.connections.map((connection) => connection.disconnect()),
        );
        const failures = results.filter((result) => result.status === 'rejected');
        if (failures.length > 0) {
          throw new AggregateError(failures, 'Dependency shutdown operation failed.');
        }
      })();

      let timeout: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          options.server.closeAllConnections();
          reject(new Error('Graceful shutdown timed out.'));
        }, options.timeoutMs);
        timeout.unref();
      });

      try {
        await Promise.race([gracefulClose, timeoutPromise]);
        options.logger.info('Graceful shutdown completed');
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    })();

    return shutdownPromise;
  };
}
