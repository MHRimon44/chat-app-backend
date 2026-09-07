import type { Logger } from 'pino';

import type { RecoveryNotifier } from './ports.js';

export function createUnconfiguredRecoveryNotifier(logger: Logger): RecoveryNotifier {
  return {
    sendPasswordReset({ expiresAt }) {
      logger.warn(
        { expiresAt },
        'Password recovery requested, but no email provider is configured; token was not logged',
      );
      return Promise.resolve();
    },
  };
}
