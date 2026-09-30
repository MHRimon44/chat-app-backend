import { AppError } from '../src/errors/app-error.js';
import { createAuthService } from '../src/auth/service.js';
import type {
  AccessTokenProvider,
  AuthRepository,
  PasswordHasher,
  RateLimiter,
} from '../src/auth/ports.js';
import type { EmailNotifier } from '../src/auth/email-notifier.js';
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
    findUserByUsername: jest.fn(async () => null),
    findUserById: jest.fn(async () => user),
    findRefreshSessionId: jest.fn(async () => session.id),
    isSessionActive: jest.fn(async () => true),
    createSession: jest.fn(async () => session),
    rotateRefreshToken: jest.fn(async () => ({ session, user })),
    revokeSession: jest.fn(async () => true),
    revokeAllSessions: jest.fn(async () => undefined),
    listSessions: jest.fn(async () => [session]),
    upsertPendingRegistration: jest.fn(async (input) => ({ id: 'pending-1', ...input })),
    findPendingRegistration: jest.fn(async () => null),
    consumePendingRegistration: jest.fn(async () => null),
    createPasswordReset: jest.fn(async (input) => ({ id: 'reset-1', ...input })),
    findPasswordReset: jest.fn(async () => null),
    verifyPasswordReset: jest.fn(async () => true),
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
  const notifier: EmailNotifier = { sendOtp: jest.fn(async () => undefined) };
  const service = createAuthService({
    accessTokens,
    now: () => fixedNow,
    passwordHasher: hasher,
    rateLimiter,
    emailNotifier: notifier,
    repository,
    refreshTokenTtlDays: 30,
    resetTtlMinutes: 15,
  });
  return { accessTokens, hasher, notifier, rateLimiter, repository, service };
}

describe('authentication service', () => {
  it('normalizes registration identity, hashes the password, and sends an OTP without creating a user', async () => {
    const context = setup({ repository: { findUserByEmail: jest.fn(async () => null) } });
    const result = await context.service.register({
      username: ' Mehedi_Hasan ',
      displayName: ' Mehedi Hasan ',
      email: ' Mehedi@Example.COM ',
      password: 'a secure passphrase',
      device: { platform: 'ios', ip: '127.0.0.1' },
    });

    expect(context.repository.upsertPendingRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        emailNormalized: 'mehedi@example.com',
        usernameNormalized: 'mehedi_hasan',
        passwordHash: 'new-hash',
      }),
    );
    expect(result).toEqual({ message: 'A verification code has been sent to your email.' });
    expect(context.repository.createUser).not.toHaveBeenCalled();
    expect(context.notifier.sendOtp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'Mehedi@Example.COM', purpose: 'registration',
    }));
  });

  it('verifies registration OTP before creating the user and session', async () => {
    const context = setup({ repository: {
      findPendingRegistration: jest.fn(async () => ({
        id: 'pending-1', usernameNormalized: 'mehedi_hasan', displayName: 'Mehedi Hasan',
        email: user.email, emailNormalized: user.emailNormalized,
        passwordHash: 'new-hash', otpHash: 'otp-hash', createdAt: fixedNow,
        expiresAt: new Date(fixedNow.getTime() + 900_000),
      })),
      consumePendingRegistration: jest.fn(async () => ({
        id: 'pending-1', usernameNormalized: 'mehedi_hasan', displayName: 'Mehedi Hasan',
        email: user.email, emailNormalized: user.emailNormalized,
        passwordHash: 'new-hash', otpHash: 'otp-hash', createdAt: fixedNow,
        expiresAt: new Date(fixedNow.getTime() + 900_000),
      })),
    } });
    const result = await context.service.verifyRegistration({
      email: user.email, otp: '123456', device: { platform: 'android' },
    });
    expect(result.refreshToken).toHaveLength(43);
    expect(context.repository.createUser).toHaveBeenCalledTimes(1);
    expect(context.repository.createSession).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid registration OTP', async () => {
    const context = setup();
    await expect(context.service.verifyRegistration({
      email: user.email, otp: '000000', device: {},
    })).rejects.toMatchObject({ code: 'INVALID_OTP', statusCode: 400 });
    expect(context.repository.createUser).not.toHaveBeenCalled();
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
    expect(present.notifier.sendOtp).toHaveBeenCalledTimes(1);
    expect(absent.notifier.sendOtp).not.toHaveBeenCalled();
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
