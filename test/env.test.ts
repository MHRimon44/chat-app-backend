import { EnvironmentValidationError, loadConfig } from '../src/config/env.js';

const validEnvironment: NodeJS.ProcessEnv = {
  ACCESS_TOKEN_AUDIENCE: 'chat-mobile-test',
  ACCESS_TOKEN_ISSUER: 'chat-api-test',
  ACCESS_TOKEN_PRIVATE_KEY_BASE64: Buffer.from('private-key').toString('base64'),
  ACCESS_TOKEN_PUBLIC_KEY_BASE64: Buffer.from('public-key').toString('base64'),
  CORS_ALLOWED_ORIGINS: 'https://app.example,https://admin.example',
  MONGODB_URI: 'mongodb://user:password@localhost:27017/chat_test',
  NODE_ENV: 'test',
  PASSWORD_RESET_URL: 'https://app.example/password/reset',
  REDIS_URL: 'redis://:password@localhost:6379/1',
};

describe('API environment configuration', () => {
  it('parses, normalizes, and freezes valid configuration', () => {
    const config = loadConfig(validEnvironment);

    expect(config.corsAllowedOrigins).toEqual(['https://app.example', 'https://admin.example']);
    expect(config.port).toBe(4_000);
    expect(config.trustProxy).toBe(false);
    expect(config.email).toEqual({ provider: 'unconfigured' });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.corsAllowedOrigins)).toBe(true);
  });

  it('requires complete SES configuration when the provider is enabled', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, EMAIL_PROVIDER: 'ses', SES_REGION: 'ap-southeast-1' }),
    ).toThrow(EnvironmentValidationError);
  });

  it('builds a typed SES configuration without static AWS credentials', () => {
    const config = loadConfig({
      ...validEnvironment,
      EMAIL_PROVIDER: 'ses',
      SES_FROM_EMAIL: 'security@example.com',
      SES_REGION: 'ap-southeast-1',
      SES_TEMPLATE_NAME: 'password-reset-v1',
    });

    expect(config.email).toEqual({
      fromEmail: 'security@example.com',
      provider: 'ses',
      region: 'ap-southeast-1',
      templateName: 'password-reset-v1',
    });
  });

  it('accepts local SMTP only outside production', () => {
    const config = loadConfig({
      ...validEnvironment,
      EMAIL_PROVIDER: 'smtp',
      PASSWORD_RESET_URL: 'http://localhost:3000/password/reset',
      SMTP_FROM_EMAIL: 'security@chat.local',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
    });

    expect(config.email).toEqual({
      fromEmail: 'security@chat.local',
      host: '127.0.0.1',
      port: 1025,
      provider: 'smtp',
    });
  });

  it('rejects local SMTP and HTTP reset links in production', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        EMAIL_PROVIDER: 'smtp',
        NODE_ENV: 'production',
        PASSWORD_RESET_URL: 'http://localhost:3000/password/reset',
        SMTP_FROM_EMAIL: 'security@chat.local',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
      }),
    ).toThrow(EnvironmentValidationError);
  });

  it('rejects wildcard CORS configuration', () => {
    expect(() => loadConfig({ ...validEnvironment, CORS_ALLOWED_ORIGINS: '*' })).toThrow(
      EnvironmentValidationError,
    );
  });

  it('accepts encrypted production-style provider connection schemes', () => {
    const config = loadConfig({
      ...validEnvironment,
      MONGODB_URI: 'mongodb+srv://user:password@cluster.example/chat',
      REDIS_URL: 'rediss://:password@redis.example:6380/0',
    });

    expect(config.mongoUri).toMatch(/^mongodb\+srv:\/\//);
    expect(config.redisUrl).toMatch(/^rediss:\/\//);
  });

  it('rejects missing required connection configuration without exposing values', () => {
    try {
      loadConfig({ NODE_ENV: 'test' });
      throw new Error('Expected environment validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as EnvironmentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('MONGODB_URI'),
          expect.stringContaining('REDIS_URL'),
          expect.stringContaining('CORS_ALLOWED_ORIGINS'),
        ]),
      );
    }
  });
});
