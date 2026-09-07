import nodemailer, { type Transporter } from 'nodemailer';

import type { RecoveryNotifier } from './ports.js';

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

export function createSmtpRecoveryNotifier(input: {
  fromEmail: string;
  host: string;
  port: number;
  transporter?: Pick<Transporter, 'sendMail'>;
}): RecoveryNotifier {
  const transporter =
    input.transporter ??
    nodemailer.createTransport({ host: input.host, port: input.port, secure: false });

  return {
    async sendPasswordReset({ email, expiresAt, resetUrl }) {
      const safeUrl = escapeHtml(resetUrl);
      const safeExpiry = escapeHtml(expiresAt.toISOString());
      await transporter.sendMail({
        from: input.fromEmail,
        html: `<p>A password reset was requested for your account.</p><p><a href="${safeUrl}">Reset your password</a></p><p>This link expires at ${safeExpiry}.</p><p>If you did not request this, ignore this email.</p>`,
        subject: 'Reset your password',
        text: `A password reset was requested for your account.\n\nReset your password: ${resetUrl}\n\nThis link expires at ${expiresAt.toISOString()}.\n\nIf you did not request this, ignore this email.`,
        to: email,
      });
    },
  };
}
