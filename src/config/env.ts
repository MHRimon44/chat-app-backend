import { z } from 'zod';

const commaSeparatedOriginsSchema = z
  .string()
  .min(1)
  .transform((value, context) => {
    const origins = value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (origins.includes('*')) {
      context.addIssue({ code: 'custom', message: 'Wildcard CORS origins are not allowed.' });
      return z.NEVER;
    }

    const invalidOrigin = origins.find((origin) => {
      try {
        const url = new URL(origin);
        return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin;
      } catch {
        return true;
      }
    });

    if (invalidOrigin) {
      context.addIssue({ code: 'custom', message: `Invalid CORS origin: ${invalidOrigin}` });
      return z.NEVER;
    }

    return origins;
  });

const mongoUriSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
    'MongoDB URI must use mongodb:// or mongodb+srv://.',
  );

const redisUriSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
    'Redis URI must use redis:// or rediss://.',
  );

const environmentSchema = z
  .object({
    ACCESS_TOKEN_AUDIENCE: z.string().min(1).max(200),
    ACCESS_TOKEN_ISSUER: z.string().min(1).max(200),
    ACCESS_TOKEN_PRIVATE_KEY_BASE64: z.string().min(1),
    ACCESS_TOKEN_PUBLIC_KEY_BASE64: z.string().min(1),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(600),
    BODY_LIMIT: z
      .string()
      .regex(/^\d+(?:b|kb|mb)$/i)
      .default('100kb'),
    CORS_ALLOWED_ORIGINS: commaSeparatedOriginsSchema,
    EMAIL_PROVIDER: z.enum(['unconfigured', 'smtp', 'ses']).default('unconfigured'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(20),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60_000)
      .default(5_000),
    MONGODB_URI: mongoUriSchema,
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
    REDIS_URL: redisUriSchema,
    SES_FROM_EMAIL: z.string().email().optional(),
    SES_REGION: z
      .string()
      .regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/)
      .optional(),
    SES_TEMPLATE_NAME: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    SMTP_FROM_EMAIL: z.string().email().optional(),
    SMTP_HOST: z.string().min(1).max(253).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    PASSWORD_RESET_URL: z.string().url(),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
    TRUST_PROXY: z.enum(['false', 'loopback']).default('false'),
  })
  .superRefine((value, context) => {
    const resetUrl = new URL(value.PASSWORD_RESET_URL);
    const localResetHost = ['localhost', '127.0.0.1', '[::1]'].includes(resetUrl.hostname);
    if (resetUrl.protocol !== 'https:' && (value.NODE_ENV === 'production' || !localResetHost)) {
      context.addIssue({
        code: 'custom',
        message: 'Password reset URL must use HTTPS except on a local development host.',
        path: ['PASSWORD_RESET_URL'],
      });
    }

    if (value.EMAIL_PROVIDER === 'ses') {
      for (const key of ['SES_FROM_EMAIL', 'SES_REGION', 'SES_TEMPLATE_NAME'] as const) {
        if (!value[key]) {
          context.addIssue({
            code: 'custom',
            message: `${key} is required when EMAIL_PROVIDER=ses.`,
            path: [key],
          });
        }
      }
    }

    if (value.EMAIL_PROVIDER === 'smtp') {
      if (value.NODE_ENV === 'production') {
        context.addIssue({
          code: 'custom',
          message: 'The local SMTP adapter is not allowed in production.',
          path: ['EMAIL_PROVIDER'],
        });
      }
      for (const key of ['SMTP_FROM_EMAIL', 'SMTP_HOST', 'SMTP_PORT'] as const) {
        if (!value[key]) {
          context.addIssue({
            code: 'custom',
            message: `${key} is required when EMAIL_PROVIDER=smtp.`,
            path: [key],
          });
        }
      }
    }
  });

export type ApiConfig = Readonly<{
  accessTokenAudience: string;
  accessTokenIssuer: string;
  accessTokenPrivateKey: string;
  accessTokenPublicKey: string;
  accessTokenTtlSeconds: number;
  bodyLimit: string;
  corsAllowedOrigins: readonly string[];
  email:
    | Readonly<{ provider: 'unconfigured' }>
    | Readonly<{ fromEmail: string; host: string; port: number; provider: 'smtp' }>
    | Readonly<{ fromEmail: string; provider: 'ses'; region: string; templateName: string }>;
  logLevel: z.infer<typeof environmentSchema>['LOG_LEVEL'];
  mongoMaxPoolSize: number;
  mongoServerSelectionTimeoutMs: number;
  mongoUri: string;
  nodeEnv: z.infer<typeof environmentSchema>['NODE_ENV'];
  port: number;
  redisConnectTimeoutMs: number;
  redisUrl: string;
  refreshTokenTtlDays: number;
  passwordResetTtlMinutes: number;
  passwordResetUrl: string;
  shutdownTimeoutMs: number;
  trustProxy: false | 'loopback';
}>;

export class EnvironmentValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(`Invalid API environment configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'environment';
      return `${path}: ${issue.message}`;
    });

    throw new EnvironmentValidationError(issues);
  }

  let email: ApiConfig['email'];
  if (result.data.EMAIL_PROVIDER === 'ses') {
    email = Object.freeze({
      fromEmail: result.data.SES_FROM_EMAIL!,
      provider: 'ses' as const,
      region: result.data.SES_REGION!,
      templateName: result.data.SES_TEMPLATE_NAME!,
    });
  } else if (result.data.EMAIL_PROVIDER === 'smtp') {
    email = Object.freeze({
      fromEmail: result.data.SMTP_FROM_EMAIL!,
      host: result.data.SMTP_HOST!,
      port: result.data.SMTP_PORT!,
      provider: 'smtp' as const,
    });
  } else {
    email = Object.freeze({ provider: 'unconfigured' as const });
  }

  return Object.freeze({
    accessTokenAudience: result.data.ACCESS_TOKEN_AUDIENCE,
    accessTokenIssuer: result.data.ACCESS_TOKEN_ISSUER,
    accessTokenPrivateKey: Buffer.from(
      result.data.ACCESS_TOKEN_PRIVATE_KEY_BASE64,
      'base64',
    ).toString('utf8'),
    accessTokenPublicKey: Buffer.from(
      result.data.ACCESS_TOKEN_PUBLIC_KEY_BASE64,
      'base64',
    ).toString('utf8'),
    accessTokenTtlSeconds: result.data.ACCESS_TOKEN_TTL_SECONDS,
    bodyLimit: result.data.BODY_LIMIT,
    corsAllowedOrigins: Object.freeze([...result.data.CORS_ALLOWED_ORIGINS]),
    email,
    logLevel: result.data.LOG_LEVEL,
    mongoMaxPoolSize: result.data.MONGODB_MAX_POOL_SIZE,
    mongoServerSelectionTimeoutMs: result.data.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    mongoUri: result.data.MONGODB_URI,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    redisConnectTimeoutMs: result.data.REDIS_CONNECT_TIMEOUT_MS,
    redisUrl: result.data.REDIS_URL,
    refreshTokenTtlDays: result.data.REFRESH_TOKEN_TTL_DAYS,
    passwordResetTtlMinutes: result.data.PASSWORD_RESET_TTL_MINUTES,
    passwordResetUrl: result.data.PASSWORD_RESET_URL,
    shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
    trustProxy: result.data.TRUST_PROXY === 'loopback' ? 'loopback' : false,
  });
}
