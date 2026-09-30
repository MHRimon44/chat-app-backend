import type { EmailNotifier } from './email-notifier.js';

export interface ResendTransport {
  send(input: {
    fromEmail: string;
    fromName: string;
    toEmail: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
}

function escapeHtml(value: string): string {
  const entities: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

export function createResendTransport(apiKey: string): ResendTransport {
  return {
    async send(input) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: `${input.fromName} <${input.fromEmail}>`,
          to: [input.toEmail],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Resend email request failed (${response.status}): ${body.slice(0, 500)}`);
      }
    },
  };
}

export function createResendEmailNotifier(input: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  transport?: ResendTransport;
}): EmailNotifier {
  const transport = input.transport ?? createResendTransport(input.apiKey);

  return {
    async sendOtp({ email, expiresAt, otp, purpose }) {
      const isRegistration = purpose === 'registration';
      const subject = isRegistration ? 'Verify your Alap account' : 'Reset your Alap password';
      const heading = isRegistration ? 'Verify your email' : 'Reset your password';
      const description = isRegistration
        ? 'Use this verification code to finish creating your Alap account.'
        : 'Use this verification code to continue resetting your Alap password.';
      const safeOtp = escapeHtml(otp);
      const safeExpiry = escapeHtml(expiresAt.toISOString());

      await transport.send({
        fromEmail: input.fromEmail,
        fromName: input.fromName,
        toEmail: email,
        subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>${heading}</h2><p>${description}</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${safeOtp}</p><p>This code expires at ${safeExpiry}.</p><p>If you did not request this, you can ignore this email.</p></div>`,
        text: `${heading}\n\n${description}\n\nVerification code: ${otp}\n\nThis code expires at ${expiresAt.toISOString()}.\n\nIf you did not request this, you can ignore this email.`,
      });
    },
  };
}
