import mongoose, { type ClientSession } from 'mongoose';

import { hashSensitiveValue } from './crypto.js';
import {
  PasswordResetModel,
  PendingRegistrationModel,
  RefreshTokenModel,
  SessionModel,
  UserModel,
} from './models.js';
import type { AuthRepository } from './ports.js';
import type {
  AuthUser,
  PasswordResetRecord,
  PendingRegistrationRecord,
  SessionRecord,
} from './types.js';

export function createMongoAuthRepository(): AuthRepository {
  return {
    async deletePendingRegistration(emailNormalized) {
      await PendingRegistrationModel.deleteOne({ emailNormalized });
    },

    async createUser(input) {
      const [created] = await UserModel.create([
        {
          emailNormalized: input.emailNormalized,
          emailDisplay: input.email,
          usernameNormalized: input.usernameNormalized,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          passwordChangedAt: input.passwordChangedAt,
        },
      ]);
      if (!created) throw new Error('User creation returned no record.');
      return mapUser(created.toObject(), true);
    },

    async findUserByEmail(emailNormalized) {
      const document = await UserModel.findOne({ emailNormalized }).select('+passwordHash').lean();
      return document ? mapUser(document, true) : null;
    },

    async findUserByUsername(usernameNormalized) {
      const document = await UserModel.findOne({ usernameNormalized })
        .select('+passwordHash')
        .lean();
      return document ? mapUser(document, true) : null;
    },

    async findUserById(userId) {
      const document = await UserModel.findById(userId).select('+passwordHash').lean();
      return document ? mapUser(document, true) : null;
    },

    async isSessionActive(sessionId, userId, now) {
      return Boolean(
        await SessionModel.exists({
          _id: sessionId,
          userId,
          revokedAt: { $exists: false },
          expiresAt: { $gt: now },
        }),
      );
    },

    async findRefreshSessionId(tokenHash, now) {
      const token = await RefreshTokenModel.findOne({
        tokenHash,
        expiresAt: { $gt: now },
      }).lean();
      if (!token) return null;
      const active = await SessionModel.exists({
        _id: token.sessionId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: now },
      });
      return active ? String(token.sessionId) : null;
    },

    async createSession(input) {
      return mongoose.connection.transaction(async (transaction) => {
        const now = new Date();
        const [session] = await SessionModel.create(
          [
            {
              userId: input.userId,
              familyId: input.familyId,
              expiresAt: input.expiresAt,
              lastUsedAt: now,
              ...(input.device.deviceId
                ? { deviceIdHash: hashSensitiveValue(input.device.deviceId) }
                : {}),
              ...(input.device.deviceName ? { deviceName: input.device.deviceName } : {}),
              platform: input.device.platform ?? 'unknown',
              ...(input.device.appVersion ? { appVersion: input.device.appVersion } : {}),
              ...(input.device.ip ? { ipHash: hashSensitiveValue(input.device.ip) } : {}),
              ...(input.device.userAgent
                ? { userAgent: input.device.userAgent.slice(0, 300) }
                : {}),
            },
          ],
          { session: transaction },
        );
        if (!session) throw new Error('Session creation returned no record.');
        await RefreshTokenModel.create(
          [
            {
              sessionId: session._id,
              familyId: input.familyId,
              tokenHash: input.refreshTokenHash,
              expiresAt: asDate(session.expiresAt),
            },
          ],
          { session: transaction },
        );
        return mapSession(session.toObject());
      });
    },

    async rotateRefreshToken(input) {
      return mongoose.connection.transaction(async (transaction) => {
        const token = await RefreshTokenModel.findOne({ tokenHash: input.tokenHash })
          .session(transaction)
          .lean();
        if (!token || asDate(token.expiresAt) <= input.now) return 'invalid';
        const session = await SessionModel.findById(token.sessionId).session(transaction).lean();
        if (!session || session.revokedAt || asDate(session.expiresAt) <= input.now)
          return 'invalid';
        if (token.rotatedAt) {
          await revokeFamily(String(token.familyId), 'refresh_reuse', input.now, transaction);
          return 'reused';
        }

        const [replacement] = await RefreshTokenModel.create(
          [
            {
              sessionId: token.sessionId,
              familyId: token.familyId,
              tokenHash: input.newTokenHash,
              expiresAt: asDate(session.expiresAt),
            },
          ],
          { session: transaction },
        );
        if (!replacement) throw new Error('Refresh token rotation returned no record.');
        const rotated = await RefreshTokenModel.updateOne(
          { _id: token._id, rotatedAt: { $exists: false } },
          { $set: { rotatedAt: input.now, replacedByTokenId: replacement._id } },
          { session: transaction },
        );
        if (rotated.modifiedCount !== 1) {
          await revokeFamily(String(token.familyId), 'refresh_reuse', input.now, transaction);
          return 'reused';
        }
        await SessionModel.updateOne(
          { _id: session._id },
          { $set: { lastUsedAt: input.now } },
          { session: transaction },
        );
        const user = await UserModel.findById(session.userId)
          .select('+passwordHash')
          .session(transaction)
          .lean();
        if (!user || user.status !== 'active') {
          await revokeFamily(String(token.familyId), 'account_unavailable', input.now, transaction);
          return 'invalid';
        }
        return {
          session: mapSession({ ...session, lastUsedAt: input.now }),
          user: mapUser(user, true),
        };
      });
    },

    async revokeSession(sessionId, userId, reason, now) {
      const result = await SessionModel.updateOne(
        { _id: sessionId, userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: now, revokeReason: reason } },
      );
      return result.modifiedCount === 1;
    },

    async revokeAllSessions(userId, reason, now) {
      await SessionModel.updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: now, revokeReason: reason } },
      );
    },

    async listSessions(userId) {
      const documents = await SessionModel.find({
        userId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
        .sort({ lastUsedAt: -1 })
        .limit(100)
        .lean();
      return documents.map(mapSession);
    },

    async upsertPendingRegistration(input) {
      const document = await PendingRegistrationModel.findOneAndUpdate(
        { emailNormalized: input.emailNormalized },
        {
          $set: {
            usernameNormalized: input.usernameNormalized,
            displayName: input.displayName,
            emailDisplay: input.email,
            passwordHash: input.passwordHash,
            otpHash: input.otpHash,
            expiresAt: input.expiresAt,
          },
          $setOnInsert: { createdAt: input.createdAt },
        },
        { new: true, upsert: true },
      ).lean();
      return mapPendingRegistration(document);
    },

    async findPendingRegistration(emailNormalized, now) {
      const document = await PendingRegistrationModel.findOne({
        emailNormalized,
        expiresAt: { $gt: now },
      }).lean();
      return document ? mapPendingRegistration(document) : null;
    },

    async consumePendingRegistration(emailNormalized, now) {
      const document = await PendingRegistrationModel.findOneAndDelete({
        emailNormalized,
        expiresAt: { $gt: now },
      }).lean();
      return document ? mapPendingRegistration(document) : null;
    },

    async createPasswordReset(input) {
      await PasswordResetModel.updateMany(
        { userId: input.userId, consumedAt: { $exists: false } },
        { $set: { consumedAt: input.createdAt } },
      );
      const [created] = await PasswordResetModel.create([input]);
      if (!created) throw new Error('Password reset creation returned no record.');
      return mapPasswordReset(created.toObject());
    },

    async findPasswordReset(userId, now) {
      const document = await PasswordResetModel.findOne({
        userId,
        consumedAt: { $exists: false },
        expiresAt: { $gt: now },
      })
        .sort({ createdAt: -1 })
        .lean();
      return document ? mapPasswordReset(document) : null;
    },

    async verifyPasswordReset(input) {
      const result = await PasswordResetModel.updateOne(
        {
          _id: input.resetId,
          consumedAt: { $exists: false },
          expiresAt: { $gt: input.now },
          verifiedAt: { $exists: false },
        },
        { $set: { verifiedAt: input.now, resetTokenHash: input.resetTokenHash } },
      );
      return result.modifiedCount === 1;
    },

    async consumePasswordReset(input) {
      return mongoose.connection.transaction(async (transaction) => {
        const token = await PasswordResetModel.findOneAndUpdate(
          {
            resetTokenHash: input.resetTokenHash,
            verifiedAt: { $exists: true },
            consumedAt: { $exists: false },
            expiresAt: { $gt: input.now },
          },
          { $set: { consumedAt: input.now } },
          { new: true, session: transaction },
        ).lean();
        if (!token) return null;
        const user = await UserModel.findByIdAndUpdate(
          token.userId,
          { $set: { passwordHash: input.newPasswordHash, passwordChangedAt: input.now } },
          { new: true, session: transaction },
        )
          .select('+passwordHash')
          .lean();
        if (!user) return null;
        await SessionModel.updateMany(
          { userId: token.userId, revokedAt: { $exists: false } },
          { $set: { revokedAt: input.now, revokeReason: 'password_reset' } },
          { session: transaction },
        );
        return mapUser(user, true);
      });
    },
  };
}

async function revokeFamily(
  familyId: string,
  reason: string,
  now: Date,
  transaction: ClientSession,
): Promise<void> {
  await SessionModel.updateMany(
    { familyId, revokedAt: { $exists: false } },
    { $set: { revokedAt: now, revokeReason: reason } },
    { session: transaction },
  );
}

function mapUser(value: unknown, includePassword: boolean): AuthUser {
  const record = asRecord(value);
  const passwordHash = includePassword ? asString(record.passwordHash) : '';
  return {
    id: String(record._id),
    ...(record.usernameNormalized ? { username: asString(record.usernameNormalized) } : {}),
    email: String(record.emailDisplay),
    emailNormalized: String(record.emailNormalized),
    displayName: String(record.displayName),
    passwordHash,
    passwordChangedAt: asDate(record.passwordChangedAt),
    status: record.status === 'disabled' ? 'disabled' : 'active',
  };
}

function mapSession(value: unknown): SessionRecord {
  const record = asRecord(value);
  return {
    id: String(record._id),
    userId: String(record.userId),
    familyId: String(record.familyId),
    createdAt: asDate(record.createdAt),
    expiresAt: asDate(record.expiresAt),
    lastUsedAt: asDate(record.lastUsedAt),
    ...(record.revokedAt ? { revokedAt: asDate(record.revokedAt) } : {}),
    ...(record.revokeReason ? { revokeReason: asString(record.revokeReason) } : {}),
    device: {
      ...(record.deviceIdHash ? { deviceIdHash: asString(record.deviceIdHash) } : {}),
      ...(record.deviceName ? { deviceName: asString(record.deviceName) } : {}),
      ...(record.platform
        ? { platform: asString(record.platform) as 'android' | 'ios' | 'unknown' }
        : {}),
      ...(record.appVersion ? { appVersion: asString(record.appVersion) } : {}),
      ...(record.ipHash ? { ipHash: asString(record.ipHash) } : {}),
      ...(record.userAgent ? { userAgent: asString(record.userAgent) } : {}),
    },
  };
}

function mapPendingRegistration(value: unknown): PendingRegistrationRecord {
  const record = asRecord(value);
  return {
    id: String(record._id),
    usernameNormalized: asString(record.usernameNormalized),
    displayName: asString(record.displayName),
    email: asString(record.emailDisplay),
    emailNormalized: asString(record.emailNormalized),
    passwordHash: asString(record.passwordHash),
    otpHash: asString(record.otpHash),
    createdAt: asDate(record.createdAt),
    expiresAt: asDate(record.expiresAt),
  };
}

function mapPasswordReset(value: unknown): PasswordResetRecord {
  const record = asRecord(value);
  return {
    id: String(record._id),
    userId: String(record.userId),
    otpHash: String(record.otpHash),
    createdAt: asDate(record.createdAt),
    expiresAt: asDate(record.expiresAt),
    ...(record.resetTokenHash ? { resetTokenHash: asString(record.resetTokenHash) } : {}),
    ...(record.verifiedAt ? { verifiedAt: asDate(record.verifiedAt) } : {}),
    ...(record.consumedAt ? { consumedAt: asDate(record.consumedAt) } : {}),
  };
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid database record.');
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid database string field.');
  return value;
}
