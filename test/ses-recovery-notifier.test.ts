import type { SendEmailCommand } from '@aws-sdk/client-sesv2';

import {
  createAwsSesEmailClient,
  createSesRecoveryNotifier,
  type AwsSesTransport,
  type SesEmailClient,
} from '../src/auth/ses-recovery-notifier.js';

describe('SES recovery notifier', () => {
  it('maps the provider-neutral request to SES v2 template input', async () => {
    const send = jest.fn(async (_command: SendEmailCommand): Promise<unknown> => undefined);
    const transport: AwsSesTransport = { send };
    const client = createAwsSesEmailClient('ap-southeast-1', transport);

    await client.sendTemplatedEmail({
      fromEmail: 'security@example.com',
      templateData: {
        expiresAt: '2026-08-27T12:30:00.000Z',
        resetUrl: 'https://app.example.com/password/reset?token=opaque',
      },
      templateName: 'password-reset-v1',
      toEmail: 'member@example.com',
    });

    const command = send.mock.calls[0]?.[0];
    expect(command?.input).toEqual({
      Content: {
        Template: {
          TemplateData: JSON.stringify({
            expiresAt: '2026-08-27T12:30:00.000Z',
            resetUrl: 'https://app.example.com/password/reset?token=opaque',
          }),
          TemplateName: 'password-reset-v1',
        },
      },
      Destination: { ToAddresses: ['member@example.com'] },
      FromEmailAddress: 'security@example.com',
    });
  });

  it('passes reset data to an injected SES client', async () => {
    const sendTemplatedEmail = jest.fn(async () => undefined);
    const client: SesEmailClient = { sendTemplatedEmail };
    const notifier = createSesRecoveryNotifier({
      client,
      fromEmail: 'security@example.com',
      templateName: 'password-reset-v1',
    });
    await notifier.sendPasswordReset({
      email: 'member@example.com',
      expiresAt: new Date('2026-08-27T12:30:00.000Z'),
      resetUrl: 'https://app.example.com/password/reset?token=opaque',
    });
    expect(sendTemplatedEmail).toHaveBeenCalledWith({
      fromEmail: 'security@example.com',
      templateName: 'password-reset-v1',
      toEmail: 'member@example.com',
      templateData: {
        expiresAt: '2026-08-27T12:30:00.000Z',
        resetUrl: 'https://app.example.com/password/reset?token=opaque',
      },
    });
  });
});
