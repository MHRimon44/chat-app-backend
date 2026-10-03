import { randomUUID } from 'node:crypto';

import { AppError } from '../errors/app-error.js';
import {
  createNumericOtp,
  createOpaqueToken,
  hashOpaqueToken,
  hashSensitiveValue,
} from './crypto.js';
import type { EmailNotifier } from './email-notifier.js';
import type {
  AccessTokenProvider,
  AuthRepository,
  PasswordHasher,
  RateLimiter,
  NewUser,
} from './ports.js';
import type { AuthUser, DeviceMetadata, PublicAuthUser, SessionView, TokenPair } from './types.js';

const GENERIC_RECOVERY_MESSAGE =
  'If an account matches that email, a password reset code will be sent.';
const REGISTRATION_MESSAGE = 'A verification code has been sent to your email.';

export interface AuthService {
  authenticateAccess(token: string): Promise<{ userId: string; sessionId: string }>;
  register(input: {
    username: string;
    displayName: string;
    email: string;
    password: string;
    device: DeviceMetadata;
  }): Promise<{ message: string } | TokenPair>;
  verifyRegistration(input: {
    email: string;
    otp: string;
    device: DeviceMetadata;
  }): Promise<TokenPair>;
  login(input: { email: string; password: string; device: DeviceMetadata }): Promise<TokenPair>;
  refresh(refreshToken: string): Promise<TokenPair>;
  logout(userId: string, sessionId: string): Promise<void>;
  logoutAll(userId: string): Promise<void>;
  revokeSession(userId: string, sessionId: string): Promise<void>;
  listSessions(userId: string, currentSessionId: string): Promise<readonly SessionView[]>;
  forgotPassword(email: string, ip?: string): Promise<{ message: string }>;
  verifyPasswordResetOtp(email: string, otp: string, ip?: string): Promise<{ resetToken: string }>;
  resetPassword(token: string, newPassword: string): Promise<void>;
}

export function createAuthService(dependencies: {
  registrationOtpEnabled?: boolean;
  passwordResetEnabled?: boolean;
  accessTokens: AccessTokenProvider;
  now?: () => Date;
  passwordHasher: PasswordHasher;
  rateLimiter: RateLimiter;
  emailNotifier: EmailNotifier;
  repository: AuthRepository;
  refreshTokenTtlDays: number;
  resetTtlMinutes: number;
}): AuthService {
  const now = dependencies.now ?? (() => new Date());

  async function issuePair(
    user: AuthUser,
    sessionId: string,
    refreshToken: string,
  ): Promise<TokenPair> {
    const issued = await dependencies.accessTokens.issue({
      userId: user.id,
      sessionId,
      now: now(),
    });
    return {
      accessToken: issued.token,
      accessTokenExpiresAt: issued.expiresAt.toISOString(),
      refreshToken,
      user: publicUser(user),
    };
  }

  async function enforceLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
    const result = await dependencies.rateLimiter.consume({ key, limit, windowSeconds });
    if (!result.allowed) {
      throw new AppError({
        code: 'RATE_LIMITED',
        details: { retryAfterSeconds: result.retryAfterSeconds },
        message: 'Too many requests. Try again later.',
        statusCode: 429,
      });
    }
  }

  return {
    async authenticateAccess(token: string): Promise<{ userId: string; sessionId: string }> {
      let claims: { userId: string; sessionId: string };
      try {
        claims = await dependencies.accessTokens.verify(token);
      } catch {
        throw unauthorized();
      }
      const active = await dependencies.repository.isSessionActive(
        claims.sessionId,
        claims.userId,
        now(),
      );
      if (!active) throw unauthorized();
      return claims;
    },
    async register(input: {
      username: string;
      displayName: string;
      email: string;
      password: string;
      device: DeviceMetadata;
    }): Promise<{ message: string } | TokenPair> {
      const emailNormalized = normalizeEmail(input.email);
      await Promise.all([
        enforceLimit(`register:ip:${hashSensitiveValue(input.device.ip ?? 'unknown')}`, 5, 3_600),
        enforceLimit(`register:email:${hashSensitiveValue(emailNormalized)}`, 3, 3_600),
      ]);

      const usernameNormalized = normalizeUsername(input.username);
      const [existingEmail, existingUsername] = await Promise.all([
        dependencies.repository.findUserByEmail(emailNormalized),
        dependencies.repository.findUserByUsername(usernameNormalized),
      ]);
      if (existingEmail || existingUsername) {
        throw new AppError({
          code: 'ACCOUNT_EXISTS',
          message: 'That email or username is already in use.',
          statusCode: 409,
        });
      }

      // TEMPORARILY DISABLED: Email verification can be restored with the feature flag
      // once production email delivery/domain configuration is available.
      if (!dependencies.registrationOtpEnabled) {
        const pair = await completeRegistration(
          {
            usernameNormalized,
            displayName: input.displayName.trim(),
            email: input.email.trim(),
            emailNormalized,
            passwordHash: await dependencies.passwordHasher.hash(input.password),
            passwordChangedAt: now(),
          },
          input.device,
        );
        await dependencies.repository.deletePendingRegistration(emailNormalized);
        return pair;
      }

      const currentTime = now();
      const expiresAt = new Date(currentTime.getTime() + dependencies.resetTtlMinutes * 60_000);
      const otp = createNumericOtp();
      const [passwordHash, otpHash] = await Promise.all([
        dependencies.passwordHasher.hash(input.password),
        dependencies.passwordHasher.hash(otp),
      ]);

      try {
        await dependencies.repository.upsertPendingRegistration({
          usernameNormalized,
          displayName: input.displayName.trim(),
          email: input.email.trim(),
          emailNormalized,
          passwordHash,
          otpHash,
          createdAt: currentTime,
          expiresAt,
        });
      } catch (error) {
        if (isDuplicateError(error)) {
          throw new AppError({
            code: 'ACCOUNT_EXISTS',
            message: 'That email or username is already in use.',
            statusCode: 409,
          });
        }
        throw error;
      }

      await dependencies.emailNotifier.sendOtp({
        email: input.email.trim(),
        otp,
        purpose: 'registration',
        expiresAt,
      });
      return { message: REGISTRATION_MESSAGE };
    },

    async verifyRegistration(input: {
      email: string;
      otp: string;
      device: DeviceMetadata;
    }): Promise<TokenPair> {
      requireFeature(dependencies.registrationOtpEnabled);
      const emailNormalized = normalizeEmail(input.email);
      await enforceLimit(
        `register:verify:${hashSensitiveValue(`${emailNormalized}:${input.device.ip ?? 'unknown'}`)}`,
        5,
        900,
      );
      const pending = await dependencies.repository.findPendingRegistration(emailNormalized, now());
      const valid = pending
        ? await dependencies.passwordHasher.verify(pending.otpHash, input.otp)
        : false;
      if (!pending || !valid) {
        throw new AppError({
          code: 'INVALID_OTP',
          message: 'The verification code is invalid or expired.',
          statusCode: 400,
        });
      }

      const consumed = await dependencies.repository.consumePendingRegistration(
        emailNormalized,
        now(),
      );
      if (!consumed) {
        throw new AppError({
          code: 'INVALID_OTP',
          message: 'The verification code is invalid or expired.',
          statusCode: 400,
        });
      }

      return completeRegistration(
        {
          usernameNormalized: consumed.usernameNormalized,
          displayName: consumed.displayName,
          email: consumed.email,
          emailNormalized: consumed.emailNormalized,
          passwordHash: consumed.passwordHash,
          passwordChangedAt: now(),
        },
        input.device,
      );
    },

    async login(input: {
      email: string;
      password: string;
      device: DeviceMetadata;
    }): Promise<TokenPair> {
      const normalized = normalizeEmail(input.email);
      const sensitiveKey = hashSensitiveValue(`${normalized}:${input.device.ip ?? 'unknown'}`);
      await enforceLimit(`login:${sensitiveKey}`, 5, 900);
      const user = await dependencies.repository.findUserByEmail(normalized);
      const valid = user
        ? await dependencies.passwordHasher.verify(user.passwordHash, input.password)
        : false;
      if (!user || !valid || user.status !== 'active') {
        throw new AppError({
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect.',
          statusCode: 401,
        });
      }
      return createSessionPair(user, input.device);
    },

    async refresh(refreshToken: string): Promise<TokenPair> {
      const currentTime = now();
      const tokenHash = hashOpaqueToken(refreshToken);
      const sessionId = await dependencies.repository.findRefreshSessionId(tokenHash, currentTime);
      await enforceLimit(`refresh:${hashSensitiveValue(sessionId ?? tokenHash)}`, 30, 900);
      const replacement = createOpaqueToken();
      const result = await dependencies.repository.rotateRefreshToken({
        tokenHash,
        newTokenHash: hashOpaqueToken(replacement),
        now: currentTime,
      });
      if (result === 'invalid' || result === 'reused') {
        throw new AppError({
          code: result === 'reused' ? 'REFRESH_TOKEN_REUSED' : 'INVALID_REFRESH_TOKEN',
          message: 'The refresh session is no longer valid.',
          statusCode: 401,
        });
      }
      return issuePair(result.user, result.session.id, replacement);
    },

    async logout(userId: string, sessionId: string): Promise<void> {
      await dependencies.repository.revokeSession(sessionId, userId, 'logout', now());
    },

    async logoutAll(userId: string): Promise<void> {
      await dependencies.repository.revokeAllSessions(userId, 'logout_all', now());
    },

    async revokeSession(userId: string, sessionId: string): Promise<void> {
      const revoked = await dependencies.repository.revokeSession(
        sessionId,
        userId,
        'user_revoked',
        now(),
      );
      if (!revoked)
        throw new AppError({
          code: 'SESSION_NOT_FOUND',
          message: 'Session was not found.',
          statusCode: 404,
        });
    },

    async listSessions(userId: string, currentSessionId: string): Promise<readonly SessionView[]> {
      const sessions = await dependencies.repository.listSessions(userId);
      return sessions.map((session) => ({
        id: session.id,
        current: session.id === currentSessionId,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        ...(session.device.deviceName ? { deviceName: session.device.deviceName } : {}),
        ...(session.device.platform ? { platform: session.device.platform } : {}),
        ...(session.device.appVersion ? { appVersion: session.device.appVersion } : {}),
      }));
    },

    async forgotPassword(email: string, ip?: string): Promise<{ message: string }> {
      requireFeature(dependencies.passwordResetEnabled);
      const normalized = normalizeEmail(email);
      await Promise.all([
        enforceLimit(`forgot:email:${hashSensitiveValue(normalized)}`, 3, 3_600),
        enforceLimit(`forgot:ip:${hashSensitiveValue(ip ?? 'unknown')}`, 5, 3_600),
      ]);
      const user = await dependencies.repository.findUserByEmail(normalized);
      if (user?.status === 'active') {
        const otp = createNumericOtp();
        const createdAt = now();
        const expiresAt = new Date(createdAt.getTime() + dependencies.resetTtlMinutes * 60_000);
        const otpHash = await dependencies.passwordHasher.hash(otp);
        await dependencies.repository.createPasswordReset({
          userId: user.id,
          otpHash,
          createdAt,
          expiresAt,
        });
        await dependencies.emailNotifier.sendOtp({
          email: user.email,
          otp,
          purpose: 'password_reset',
          expiresAt,
        });
      } else {
        await dependencies.passwordHasher.hash(createOpaqueToken());
      }
      return { message: GENERIC_RECOVERY_MESSAGE };
    },

    async verifyPasswordResetOtp(
      email: string,
      otp: string,
      ip?: string,
    ): Promise<{ resetToken: string }> {
      requireFeature(dependencies.passwordResetEnabled);
      const normalized = normalizeEmail(email);
      await enforceLimit(
        `forgot:verify:${hashSensitiveValue(`${normalized}:${ip ?? 'unknown'}`)}`,
        5,
        900,
      );
      const user = await dependencies.repository.findUserByEmail(normalized);
      const reset = user ? await dependencies.repository.findPasswordReset(user.id, now()) : null;
      const valid = reset ? await dependencies.passwordHasher.verify(reset.otpHash, otp) : false;
      if (!reset || !valid) {
        throw new AppError({
          code: 'INVALID_OTP',
          message: 'The verification code is invalid or expired.',
          statusCode: 400,
        });
      }

      const resetToken = createOpaqueToken();
      const verified = await dependencies.repository.verifyPasswordReset({
        resetId: reset.id,
        resetTokenHash: hashOpaqueToken(resetToken),
        now: now(),
      });
      if (!verified) {
        throw new AppError({
          code: 'INVALID_OTP',
          message: 'The verification code is invalid or expired.',
          statusCode: 400,
        });
      }
      return { resetToken };
    },

    async resetPassword(token: string, newPassword: string): Promise<void> {
      requireFeature(dependencies.passwordResetEnabled);
      const currentTime = now();
      const passwordHash = await dependencies.passwordHasher.hash(newPassword);
      const user = await dependencies.repository.consumePasswordReset({
        resetTokenHash: hashOpaqueToken(token),
        newPasswordHash: passwordHash,
        now: currentTime,
      });
      if (!user) {
        throw new AppError({
          code: 'INVALID_RESET_TOKEN',
          message: 'The password reset token is invalid or expired.',
          statusCode: 400,
        });
      }
    },
  };

  async function completeRegistration(input: NewUser, device: DeviceMetadata): Promise<TokenPair> {
    let user: AuthUser;
    try {
      user = await dependencies.repository.createUser(input);
    } catch (error) {
      if (isDuplicateError(error))
        throw new AppError({
          code: 'ACCOUNT_EXISTS',
          message: 'That email or username is already in use.',
          statusCode: 409,
        });
      throw error;
    }
    return createSessionPair(user, device);
  }

  async function createSessionPair(user: AuthUser, device: DeviceMetadata): Promise<TokenPair> {
    const refreshToken = createOpaqueToken();
    const currentTime = now();
    const session = await dependencies.repository.createSession({
      userId: user.id,
      familyId: randomUUID(),
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt: addDays(currentTime, dependencies.refreshTokenTtlDays),
      device,
    });
    return issuePair(user, session.id, refreshToken);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().normalize('NFKC').toLowerCase();
}

function normalizeUsername(username: string): string {
  return username.trim().normalize('NFKC').toLowerCase();
}

function publicUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    ...(user.username ? { username: user.username } : {}),
    displayName: user.displayName,
    email: user.email,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function isDuplicateError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
}

function unauthorized(): AppError {
  return new AppError({
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required.',
    statusCode: 401,
  });
}

function requireFeature(enabled: boolean | undefined): void {
  if (!enabled)
    throw new AppError({
      code: 'FEATURE_DISABLED',
      message: 'This authentication feature is temporarily unavailable.',
      statusCode: 404,
    });
}
