import { createResendEmailNotifier, type ResendTransport } from '../src/auth/resend-email-notifier.js';

const expiresAt = new Date('2026-09-30T12:00:00.000Z');

describe('Resend OTP notifier', () => {
  it.each(['registration', 'password_reset'] as const)('sends %s OTP using the configured sender', async (purpose) => {
    const transport: ResendTransport = { send: jest.fn(async () => undefined) };
    const notifier = createResendEmailNotifier({
      apiKey: 're_test_placeholder_key_123456789', fromEmail: 'security@example.com',
      fromName: 'Alap', transport,
    });
    await notifier.sendOtp({ email: 'recipient@example.com', otp: '123456', purpose, expiresAt });
    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({
      fromEmail: 'security@example.com', fromName: 'Alap',
      toEmail: 'recipient@example.com',
      text: expect.stringContaining('123456'),
      html: expect.stringContaining('123456'),
    }));
  });

  it('escapes OTP characters in HTML output', async () => {
    const transport: ResendTransport = { send: jest.fn(async () => undefined) };
    const notifier = createResendEmailNotifier({
      apiKey: 're_test_placeholder_key_123456789', fromEmail: 'security@example.com',
      fromName: 'Alap', transport,
    });
    await notifier.sendOtp({ email: 'recipient@example.com', otp: '<123&>',
      purpose: 'registration', expiresAt });
    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining('&lt;123&amp;&gt;'),
    }));
  });
});
