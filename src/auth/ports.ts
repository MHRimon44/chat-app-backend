import type { AuthUser, DeviceMetadata, PasswordResetRecord, SessionRecord } from './types.js';

export type NewUser = Readonly<{
  usernameNormalized: string;
  displayName: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  passwordChangedAt: Date;
}>;

export interface AuthRepository {
  createUser(user: NewUser): Promise<AuthUser>;
  findUserByEmail(emailNormalized: string): Promise<AuthUser | null>;
  findUserById(userId: string): Promise<AuthUser | null>;
  findRefreshSessionId(tokenHash: string, now: Date): Promise<string | null>;
  isSessionActive(sessionId: string, userId: string, now: Date): Promise<boolean>;
  createSession(input: {
    userId: string;
    familyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    device: DeviceMetadata;
  }): Promise<SessionRecord>;
  rotateRefreshToken(input: {
    tokenHash: string;
    newTokenHash: string;
    now: Date;
  }): Promise<{ session: SessionRecord; user: AuthUser } | 'invalid' | 'reused'>;
  revokeSession(sessionId: string, userId: string, reason: string, now: Date): Promise<boolean>;
  revokeAllSessions(userId: string, reason: string, now: Date): Promise<void>;
  listSessions(userId: string): Promise<readonly SessionRecord[]>;
  createPasswordReset(input: {
    userId: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<PasswordResetRecord>;
  consumePasswordReset(input: {
    tokenHash: string;
    newPasswordHash: string;
    now: Date;
  }): Promise<AuthUser | null>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface AccessTokenProvider {
  issue(input: { userId: string; sessionId: string; now: Date }): Promise<{
    token: string;
    expiresAt: Date;
  }>;
  verify(token: string): Promise<{ userId: string; sessionId: string }>;
}

export interface RecoveryNotifier {
  sendPasswordReset(input: { email: string; resetUrl: string; expiresAt: Date }): Promise<void>;
}

export interface RateLimiter {
  consume(input: { key: string; limit: number; windowSeconds: number }): Promise<{
    allowed: boolean;
    retryAfterSeconds: number;
  }>;
}
