import type {
  AuthUser,
  DeviceMetadata,
  PasswordResetRecord,
  PendingRegistrationRecord,
  SessionRecord,
} from './types.js';

export type NewUser = Readonly<{
  usernameNormalized: string;
  displayName: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  passwordChangedAt: Date;
}>;

export interface AuthRepository {
  deletePendingRegistration(emailNormalized: string): Promise<void>;
  createUser(user: NewUser): Promise<AuthUser>;
  findUserByEmail(emailNormalized: string): Promise<AuthUser | null>;
  findUserByUsername(usernameNormalized: string): Promise<AuthUser | null>;
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
  upsertPendingRegistration(input: {
    usernameNormalized: string;
    displayName: string;
    email: string;
    emailNormalized: string;
    passwordHash: string;
    otpHash: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<PendingRegistrationRecord>;
  findPendingRegistration(
    emailNormalized: string,
    now: Date,
  ): Promise<PendingRegistrationRecord | null>;
  consumePendingRegistration(
    emailNormalized: string,
    now: Date,
  ): Promise<PendingRegistrationRecord | null>;
  createPasswordReset(input: {
    userId: string;
    otpHash: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<PasswordResetRecord>;
  findPasswordReset(userId: string, now: Date): Promise<PasswordResetRecord | null>;
  verifyPasswordReset(input: {
    resetId: string;
    resetTokenHash: string;
    now: Date;
  }): Promise<boolean>;
  consumePasswordReset(input: {
    resetTokenHash: string;
    newPasswordHash: string;
    now: Date;
  }): Promise<AuthUser | null>;
  updatePassword(input: {
    userId: string;
    newPasswordHash: string;
    now: Date;
    revokeReason: string;
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

export interface RateLimiter {
  consume(input: { key: string; limit: number; windowSeconds: number }): Promise<{
    allowed: boolean;
    retryAfterSeconds: number;
  }>;
}
