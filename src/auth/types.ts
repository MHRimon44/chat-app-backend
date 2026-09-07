export type UserStatus = 'active' | 'disabled';

export type AuthUser = Readonly<{
  id: string;
  displayName: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  passwordChangedAt: Date;
  status: UserStatus;
}>;

export type PublicAuthUser = Readonly<{
  id: string;
  displayName: string;
  email: string;
}>;

export type DeviceMetadata = Readonly<{
  deviceId?: string;
  deviceName?: string;
  platform?: 'android' | 'ios' | 'unknown';
  appVersion?: string;
  ip?: string;
  userAgent?: string;
}>;

export type SessionRecord = Readonly<{
  id: string;
  userId: string;
  familyId: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt?: Date;
  revokeReason?: string;
  device: Omit<DeviceMetadata, 'deviceId' | 'ip'> & { deviceIdHash?: string; ipHash?: string };
}>;

export type RefreshTokenRecord = Readonly<{
  id: string;
  sessionId: string;
  familyId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  rotatedAt?: Date;
  replacedByTokenId?: string;
}>;

export type PasswordResetRecord = Readonly<{
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
}>;

export type SessionView = Readonly<{
  id: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
}>;

export type TokenPair = Readonly<{
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  user: PublicAuthUser;
}>;
