import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { model, models, Schema } = mongoose;
export interface UserDocument {
  _id: Types.ObjectId;
  emailNormalized: string;
  emailDisplay: string;
  displayName: string;
  usernameNormalized?: string;
  bio?: string;
  avatarKey?: string;
  presenceVisibility: 'everyone' | 'contacts' | 'nobody';
  lastSeenAt?: Date;
  passwordHash: string;
  passwordChangedAt: Date;
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  familyId: string;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt?: Date;
  revokeReason?: string;
  deviceIdHash?: string;
  deviceName?: string;
  platform?: 'android' | 'ios' | 'unknown';
  appVersion?: string;
  ipHash?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshTokenDocument {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  rotatedAt?: Date;
  replacedByTokenId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingRegistrationDocument {
  _id: Types.ObjectId;
  emailNormalized: string;
  emailDisplay: string;
  usernameNormalized: string;
  displayName: string;
  passwordHash: string;
  otpHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PasswordResetDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  otpHash: string;
  resetTokenHash?: string;
  verifiedAt?: Date;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema(
  {
    emailNormalized: { type: String, required: true, unique: true },
    emailDisplay: { type: String, required: true },
    displayName: { type: String, required: true },
    usernameNormalized: { type: String, unique: true, sparse: true },
    bio: { type: String, maxlength: 160 },
    avatarKey: String,
    presenceVisibility: {
      type: String,
      enum: ['everyone', 'contacts', 'nobody'],
      default: 'everyone',
      required: true,
    },
    lastSeenAt: Date,
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: { type: Date, required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', required: true },
  },
  { timestamps: true, versionKey: 'version' },
);
userSchema.index({ status: 1, createdAt: -1 });
userSchema.index({ usernameNormalized: 1, _id: 1 });

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    revokedAt: Date,
    revokeReason: String,
    deviceIdHash: String,
    deviceName: String,
    platform: { type: String, enum: ['android', 'ios', 'unknown'] },
    appVersion: String,
    ipHash: String,
    userAgent: String,
  },
  { timestamps: true, versionKey: 'version' },
);
sessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: -1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const refreshTokenSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    rotatedAt: Date,
    replacedByTokenId: Schema.Types.ObjectId,
  },
  { timestamps: true, versionKey: false },
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const pendingRegistrationSchema = new Schema(
  {
    emailNormalized: { type: String, required: true, unique: true },
    emailDisplay: { type: String, required: true },
    usernameNormalized: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    passwordHash: { type: String, required: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);
pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    otpHash: { type: String, required: true },
    resetTokenHash: { type: String, unique: true, sparse: true },
    verifiedAt: Date,
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
  },
  { timestamps: true, versionKey: false },
);
passwordResetSchema.index({ userId: 1, createdAt: -1 });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserModel: Model<UserDocument> =
  (models.User as Model<UserDocument> | undefined) ?? model<UserDocument>('User', userSchema);
export const SessionModel: Model<SessionDocument> =
  (models.Session as Model<SessionDocument> | undefined) ??
  model<SessionDocument>('Session', sessionSchema);
export const RefreshTokenModel: Model<RefreshTokenDocument> =
  (models.RefreshToken as Model<RefreshTokenDocument> | undefined) ??
  model<RefreshTokenDocument>('RefreshToken', refreshTokenSchema);
export const PendingRegistrationModel: Model<PendingRegistrationDocument> =
  (models.PendingRegistration as Model<PendingRegistrationDocument> | undefined) ??
  model<PendingRegistrationDocument>('PendingRegistration', pendingRegistrationSchema);
export const PasswordResetModel: Model<PasswordResetDocument> =
  (models.PasswordReset as Model<PasswordResetDocument> | undefined) ??
  model<PasswordResetDocument>('PasswordReset', passwordResetSchema);
