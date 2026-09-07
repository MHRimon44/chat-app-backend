import { createSmtpRecoveryNotifier } from '../src/auth/smtp-recovery-notifier.js';

describe('local SMTP recovery notifier', () => {
  it('sends text and escaped HTML without logging or returning the reset credential', async () => {
    const sendMail = jest.fn(async (_message: unknown): Promise<unknown> => undefined);
    const notifier = createSmtpRecoveryNotifier({
      fromEmail: 'security@chat.local',
      host: '127.0.0.1',
      port: 1025,
      transporter: { sendMail },
    });

    await notifier.sendPasswordReset({
      email: 'member@example.com',
      expiresAt: new Date('2026-08-27T12:30:00.000Z'),
      resetUrl: 'http://localhost:3000/password/reset?token=a&next=<login>',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'security@chat.local',
        subject: 'Reset your password',
        to: 'member@example.com',
      }),
    );
    const message = sendMail.mock.calls[0]?.[0] as { html: string; text: string };
    expect(message.html).toContain('token=a&amp;next=&lt;login&gt;');
    expect(message.text).toContain('token=a&next=<login>');
  });
});
