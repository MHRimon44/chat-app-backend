import { AppError } from '../src/errors/app-error.js';
import { createAuthService } from '../src/auth/service.js';
import type {
  AccessTokenProvider,
  AuthRepository,
  PasswordHasher,
  RateLimiter,
  RecoveryNotifier,
} from '../src/auth/ports.js';
import type { AuthUser, SessionRecord } from '../src/auth/types.js';

const fixedNow = new Date('2026-08-27T12:00:00.000Z');
const user: AuthUser = {
  id: 'user-1',
  displayName: 'Mehedi Hasan',
  email: 'Mehedi@Example.com',
  emailNormalized: 'mehedi@example.com',
  passwordHash: 'stored-hash',
  passwordChangedAt: fixedNow,
  status: 'active',
};
const session: SessionRecord = {
  id: 'session-1',
  userId: user.id,
  familyId: 'family-1',
  createdAt: fixedNow,
  lastUsedAt: fixedNow,
  expiresAt: new Date('2026-09-26T12:00:00.000Z'),
  device: { platform: 'ios', deviceName: 'iPhone' },
};

function setup(
  overrides: {
    repository?: Partial<AuthRepository>;
    hasher?: Partial<PasswordHasher>;
    limiter?: Partial<RateLimiter>;
  } = {},
) {
  const repository: AuthRepository = {
    createUser: jest.fn(async () => user),
    findUserByEmail: jest.fn(async () => user),
    findUserById: jest.fn(async () => user),
    findRefreshSessionId: jest.fn(async () => session.id),
    isSessionActive: jest.fn(async () => true),
    createSession: jest.fn(async () => session),
    rotateRefreshToken: jest.fn(async () => ({ session, user })),
    revokeSession: jest.fn(async () => true),
    revokeAllSessions: jest.fn(async () => undefined),
    listSessions: jest.fn(async () => [session]),
    createPasswordReset: jest.fn(async (input) => ({ id: 'reset-1', ...input })),
    consumePasswordReset: jest.fn(async () => user),
    ...overrides.repository,
  };
  const hasher: PasswordHasher = {
    hash: jest.fn(async () => 'new-hash'),
    verify: jest.fn(async () => true),
    ...overrides.hasher,
  };
  const accessTokens: AccessTokenProvider = {
    issue: jest.fn(async () => ({
      token: 'access-token',
      expiresAt: new Date('2026-08-27T12:10:00.000Z'),
    })),
    verify: jest.fn(async () => ({ userId: user.id, sessionId: session.id })),
  };
  const rateLimiter: RateLimiter = {
    consume: jest.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
    ...overrides.limiter,
  };
  const notifier: RecoveryNotifier = { sendPasswordReset: jest.fn(async () => undefined) };
  const service = createAuthService({
    accessTokens,
    now: () => fixedNow,
    passwordHasher: hasher,
    rateLimiter,
    recoveryNotifier: notifier,
    repository,
    refreshTokenTtlDays: 30,
    resetTtlMinutes: 15,
    resetUrl: 'https://app.example/password/reset',
  });
  return { accessTokens, hasher, notifier, rateLimiter, repository, service };
}

describe('authentication service', () => {
  it('normalizes registration identity, hashes the password, and creates a session', async () => {
    const context = setup();
    const result = await context.service.register({
      username: ' Mehedi_Hasan ',
      displayName: ' Mehedi Hasan ',
      email: ' Mehedi@Example.COM ',
      password: 'a secure passphrase',
      device: { platform: 'ios', ip: '127.0.0.1' },
    });

    expect(context.repository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        emailNormalized: 'mehedi@example.com',
        usernameNormalized: 'mehedi_hasan',
        passwordHash: 'new-hash',
      }),
    );
    expect(result).toMatchObject({ accessToken: 'access-token', user: { id: 'user-1' } });
    expect(result.refreshToken).toHaveLength(43);
  });

  it('uses a generic login failure without revealing whether an account exists', async () => {
    const context = setup({ repository: { findUserByEmail: jest.fn(async () => null) } });

    await expect(
      context.service.login({ email: 'absent@example.com', password: 'wrong', device: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('maps refresh replay to a distinct security error', async () => {
    const context = setup({
      repository: { rotateRefreshToken: jest.fn(async () => 'reused' as const) },
    });

    await expect(context.service.refresh('x'.repeat(43))).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
      statusCode: 401,
    });
  });

  it('rejects access tokens whose session has been revoked', async () => {
    const context = setup({ repository: { isSessionActive: jest.fn(async () => false) } });

    await expect(context.service.authenticateAccess('access-token')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('returns the same recovery response for present and absent accounts', async () => {
    const present = setup();
    const absent = setup({ repository: { findUserByEmail: jest.fn(async () => null) } });

    const existingResult = await present.service.forgotPassword('Mehedi@example.com', '127.0.0.1');
    const absentResult = await absent.service.forgotPassword('absent@example.com', '127.0.0.1');

    expect(existingResult).toEqual(absentResult);
    expect(present.notifier.sendPasswordReset).toHaveBeenCalledTimes(1);
    expect(absent.notifier.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('rejects consumed or expired reset credentials', async () => {
    const context = setup({
      repository: { consumePasswordReset: jest.fn(async () => null) },
    });

    await expect(
      context.service.resetPassword('x'.repeat(43), 'a replacement passphrase'),
    ).rejects.toMatchObject({ code: 'INVALID_RESET_TOKEN', statusCode: 400 });
  });

  it('returns bounded retry guidance when a distributed limit is exceeded', async () => {
    const context = setup({
      limiter: { consume: jest.fn(async () => ({ allowed: false, retryAfterSeconds: 42 })) },
    });

    try {
      await context.service.login({ email: 'mehedi@example.com', password: 'wrong', device: {} });
      throw new Error('Expected limit rejection.');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        code: 'RATE_LIMITED',
        details: { retryAfterSeconds: 42 },
        statusCode: 429,
      });
    }
  });
});
