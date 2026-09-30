import type { Logger } from 'pino';

export type EmailOtpPurpose = 'registration' | 'password_reset';

export interface EmailNotifier {
  sendOtp(input: {
    email: string;
    otp: string;
    purpose: EmailOtpPurpose;
    expiresAt: Date;
  }): Promise<void>;
}

export function createUnconfiguredEmailNotifier(logger: Logger): EmailNotifier {
  return {
    sendOtp({ expiresAt, purpose }) {
      logger.warn(
        { expiresAt, purpose },
        'Email OTP requested, but no email provider is configured; OTP was not logged',
      );
      return Promise.resolve();
    },
  };
}
