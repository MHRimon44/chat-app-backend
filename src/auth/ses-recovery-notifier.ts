import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

import type { RecoveryNotifier } from './ports.js';

export interface SesEmailClient {
  sendTemplatedEmail(input: {
    fromEmail: string;
    templateName: string;
    toEmail: string;
    templateData: Readonly<Record<string, string>>;
  }): Promise<void>;
}

export interface AwsSesTransport {
  send(command: SendEmailCommand): Promise<unknown>;
}

export function createAwsSesEmailClient(
  region: string,
  transport?: AwsSesTransport,
): SesEmailClient {
  const client = new SESv2Client({ region });
  const sender: AwsSesTransport = transport ?? {
    send(command) {
      return client.send(command);
    },
  };

  return {
    async sendTemplatedEmail(input) {
      await sender.send(
        new SendEmailCommand({
          Content: {
            Template: {
              TemplateData: JSON.stringify(input.templateData),
              TemplateName: input.templateName,
            },
          },
          Destination: { ToAddresses: [input.toEmail] },
          FromEmailAddress: input.fromEmail,
        }),
      );
    },
  };
}

export function createSesRecoveryNotifier(input: {
  client: SesEmailClient;
  fromEmail: string;
  templateName: string;
}): RecoveryNotifier {
  return {
    async sendPasswordReset({ email, expiresAt, resetUrl }) {
      await input.client.sendTemplatedEmail({
        fromEmail: input.fromEmail,
        templateName: input.templateName,
        toEmail: email,
        templateData: { expiresAt: expiresAt.toISOString(), resetUrl },
      });
    },
  };
}
