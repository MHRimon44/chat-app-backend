import { randomUUID } from 'node:crypto';

import { AppError } from '../errors/app-error.js';
import { createOpaqueToken, hashOpaqueToken, hashSensitiveValue } from './crypto.js';
import type {
  AccessTokenProvider,
  AuthRepository,
  PasswordHasher,
  RateLimiter,
  RecoveryNotifier,
} from './ports.js';
import type { AuthUser, DeviceMetadata, PublicAuthUser, SessionView, TokenPair } from './types.js';

const GENERIC_RECOVERY_MESSAGE =
  'If an account matches that email, password reset instructions will be sent.';

export interface AuthService {
  authenticateAccess(token: string): Promise<{ userId: string; sessionId: string }>;
  register(input: {
    displayName: string;
    email: string;
    password: string;
    device: DeviceMetadata;
  }): Promise<TokenPair>;
  login(input: { email: string; password: string; device: DeviceMetadata }): Promise<TokenPair>;
  refresh(refreshToken: string): Promise<TokenPair>;
  logout(userId: string, sessionId: string): Promise<void>;
  logoutAll(userId: string): Promise<void>;
  revokeSession(userId: string, sessionId: string): Promise<void>;
  listSessions(userId: string, currentSessionId: string): Promise<readonly SessionView[]>;
  forgotPassword(email: string, ip?: string): Promise<{ message: string }>;
  resetPassword(token: string, newPassword: string): Promise<void>;
}

export function createAuthService(dependencies: {
  accessTokens: AccessTokenProvider;
  now?: () => Date;
  passwordHasher: PasswordHasher;
  rateLimiter: RateLimiter;
  recoveryNotifier: RecoveryNotifier;
  repository: AuthRepository;
  refreshTokenTtlDays: number;
  resetTtlMinutes: number;
  resetUrl: string;
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
      displayName: string;
      email: string;
      password: string;
      device: DeviceMetadata;
    }): Promise<TokenPair> {
      const emailNormalized = normalizeEmail(input.email);
      await enforceLimit(
        `register:ip:${hashSensitiveValue(input.device.ip ?? 'unknown')}`,
        5,
        3_600,
      );
      const passwordHash = await dependencies.passwordHasher.hash(input.password);
      let user: AuthUser;
      try {
        user = await dependencies.repository.createUser({
          displayName: input.displayName.trim(),
          email: input.email.trim(),
          emailNormalized,
          passwordHash,
          passwordChangedAt: now(),
        });
      } catch (error) {
        if (isDuplicateError(error)) {
          throw new AppError({
            code: 'ACCOUNT_EXISTS',
            message: 'An account with this email already exists.',
            statusCode: 409,
          });
        }
        throw error;
      }
      return createSessionPair(user, input.device);
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
      const normalized = normalizeEmail(email);
      await Promise.all([
        enforceLimit(`forgot:email:${hashSensitiveValue(normalized)}`, 3, 3_600),
        enforceLimit(`forgot:ip:${hashSensitiveValue(ip ?? 'unknown')}`, 5, 3_600),
      ]);
      const user = await dependencies.repository.findUserByEmail(normalized);
      if (user?.status === 'active') {
        const token = createOpaqueToken();
        const createdAt = now();
        const expiresAt = new Date(createdAt.getTime() + dependencies.resetTtlMinutes * 60_000);
        await dependencies.repository.createPasswordReset({
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          createdAt,
          expiresAt,
        });
        const resetUrl = new URL(dependencies.resetUrl);
        resetUrl.searchParams.set('token', token);
        await dependencies.recoveryNotifier.sendPasswordReset({
          email: user.email,
          resetUrl: resetUrl.toString(),
          expiresAt,
        });
      } else {
        await dependencies.passwordHasher.hash(createOpaqueToken());
      }
      return { message: GENERIC_RECOVERY_MESSAGE };
    },

    async resetPassword(token: string, newPassword: string): Promise<void> {
      const currentTime = now();
      const passwordHash = await dependencies.passwordHasher.hash(newPassword);
      const user = await dependencies.repository.consumePasswordReset({
        tokenHash: hashOpaqueToken(token),
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

function publicUser(user: AuthUser): PublicAuthUser {
  return { id: user.id, displayName: user.displayName, email: user.email };
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
