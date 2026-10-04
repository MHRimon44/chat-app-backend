import { Types } from 'mongoose';

import {
  PasswordResetModel,
  RefreshTokenModel,
  SessionModel,
  UserModel,
  type UserDocument,
} from '../auth/models.js';

import { ConversationMemberModel, ConversationModel } from '../conversations/models.js';

import { AppError } from '../errors/app-error.js';

import { MessageModel, MessageReactionModel, MessageUserStateModel } from '../messages/models.js';

import type { PasswordHasher } from '../auth/ports.js';
import { AdminAuditModel } from './models.js';

export type AdminUser = Readonly<{
  id: string;
  email: string;
  username?: string;
  displayName: string;
  bio?: string;
  presenceVisibility: 'everyone' | 'contacts' | 'nobody';
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
}>;

export type AdminUserDetails = Readonly<{
  user: AdminUser;
  stats: {
    activeSessions: number;
    totalSessions: number;
    conversations: number;
    messagesSent: number;
    reactions: number;
  };
  sessions: Array<{
    id: string;
    deviceName?: string;
    platform?: 'android' | 'ios' | 'unknown';
    appVersion?: string;
    createdAt: string;
    lastUsedAt: string;
    expiresAt: string;
    revokedAt?: string;
  }>;
}>;

export type AdminAuditItem = Readonly<{
  id: string;
  actorId: string;
  action: 'user.status_changed' | 'user.sessions_revoked' | 'user.password_reset' | 'user.deleted';
  targetUserId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}>;

export interface AdminService {
  assertAdmin(userId: string): Promise<void>;

  dashboard(): Promise<{
    totalUsers: number;
    activeUsers: number;
    disabledUsers: number;
    newUsersToday: number;
    activeSessions: number;
    conversations: number;
    messages: number;
    reactions: number;
  }>;

  listUsers(input: {
    query?: string;
    status?: 'active' | 'disabled';
    page: number;
    limit: number;
  }): Promise<{
    items: AdminUser[];
    page: number;
    limit: number;
    total: number;
    pages: number;
  }>;

  getUser(userId: string): Promise<AdminUserDetails>;

  setUserStatus(actorId: string, userId: string, status: 'active' | 'disabled'): Promise<AdminUser>;

  revokeSessions(actorId: string, userId: string): Promise<number>;

  resetUserPassword(actorId: string, userId: string, newPassword: string): Promise<{ reset: true; revoked: number }>; 

  deleteUser(actorId: string, userId: string): Promise<{ deleted: true }>;

  listAudit(limit: number): Promise<AdminAuditItem[]>;
}

type AdminUserSource = Pick<
  UserDocument,
  | '_id'
  | 'emailDisplay'
  | 'usernameNormalized'
  | 'displayName'
  | 'bio'
  | 'presenceVisibility'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'lastSeenAt'
>;

type AdminUserFilter = {
  status?: 'active' | 'disabled';
  $or?: Array<
    | {
        emailDisplay: {
          $regex: string;
          $options: 'i';
        };
      }
    | {
        displayName: {
          $regex: string;
          $options: 'i';
        };
      }
    | {
        usernameNormalized: {
          $regex: string;
          $options: 'i';
        };
      }
  >;
};

function mapAdminUser(user: AdminUserSource): AdminUser {
  return {
    id: String(user._id),
    email: user.emailDisplay,

    ...(user.usernameNormalized ? { username: user.usernameNormalized } : {}),

    displayName: user.displayName,

    ...(user.bio ? { bio: user.bio } : {}),

    presenceVisibility: user.presenceVisibility,
    status: user.status,

    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),

    ...(user.lastSeenAt ? { lastSeenAt: user.lastSeenAt.toISOString() } : {}),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validUserId(userId: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError({
      code: 'USER_NOT_FOUND',
      message: 'User was not found.',
      statusCode: 404,
    });
  }

  return new Types.ObjectId(userId);
}

export function createAdminService(adminEmails: readonly string[], passwordHasher: PasswordHasher): AdminService {
  const allowed = new Set(adminEmails.map((value) => value.trim().toLowerCase()).filter(Boolean));

  async function assertAdmin(userId: string): Promise<void> {
    const user = await UserModel.findById(userId).select('emailNormalized status').lean();

    if (!user || user.status !== 'active' || !allowed.has(user.emailNormalized)) {
      throw new AppError({
        code: 'ADMIN_FORBIDDEN',
        message: 'Administrator access is required.',
        statusCode: 403,
      });
    }
  }

  async function ensureTarget(userId: string): Promise<{
    id: Types.ObjectId;
    user: UserDocument;
  }> {
    const id = validUserId(userId);

    const user = await UserModel.findById(id).lean<UserDocument>();

    if (!user) {
      throw new AppError({
        code: 'USER_NOT_FOUND',
        message: 'User was not found.',
        statusCode: 404,
      });
    }

    return {
      id,
      user,
    };
  }

  return {
    assertAdmin,

    async dashboard() {
      const start = new Date();

      start.setHours(0, 0, 0, 0);

      const now = new Date();

      const [
        totalUsers,
        activeUsers,
        disabledUsers,
        newUsersToday,
        activeSessions,
        conversations,
        messages,
        reactions,
      ] = await Promise.all([
        UserModel.countDocuments({}),

        UserModel.countDocuments({
          status: 'active',
        }),

        UserModel.countDocuments({
          status: 'disabled',
        }),

        UserModel.countDocuments({
          createdAt: {
            $gte: start,
          },
        }),

        SessionModel.countDocuments({
          revokedAt: {
            $exists: false,
          },
          expiresAt: {
            $gt: now,
          },
        }),

        ConversationModel.countDocuments({}),
        MessageModel.countDocuments({}),
        MessageReactionModel.countDocuments({}),
      ]);

      return {
        totalUsers,
        activeUsers,
        disabledUsers,
        newUsersToday,
        activeSessions,
        conversations,
        messages,
        reactions,
      };
    },

    async listUsers({ query, status, page, limit }) {
      const filter: AdminUserFilter = {};

      if (status !== undefined) {
        filter.status = status;
      }

      const trimmedQuery = query?.trim();

      if (trimmedQuery) {
        const regex = {
          $regex: escapeRegex(trimmedQuery),
          $options: 'i' as const,
        };

        filter.$or = [
          {
            emailDisplay: regex,
          },
          {
            displayName: regex,
          },
          {
            usernameNormalized: regex,
          },
        ];
      }

      const [values, total] = await Promise.all([
        UserModel.find(filter)
          .sort({
            createdAt: -1,
          })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),

        UserModel.countDocuments(filter),
      ]);

      return {
        items: values.map(mapAdminUser),
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      };
    },

    async getUser(userId) {
      const { id, user } = await ensureTarget(userId);

      const now = new Date();

      const [activeSessions, totalSessions, conversations, messagesSent, reactions, sessions] =
        await Promise.all([
          SessionModel.countDocuments({
            userId: id,
            revokedAt: {
              $exists: false,
            },
            expiresAt: {
              $gt: now,
            },
          }),

          SessionModel.countDocuments({
            userId: id,
          }),

          ConversationMemberModel.countDocuments({
            userId: id,
          }),

          MessageModel.countDocuments({
            senderId: id,
          }),

          MessageReactionModel.countDocuments({
            userId: id,
          }),

          SessionModel.find({
            userId: id,
          })
            .sort({
              lastUsedAt: -1,
            })
            .limit(25)
            .lean(),
        ]);

      return {
        user: mapAdminUser(user),

        stats: {
          activeSessions,
          totalSessions,
          conversations,
          messagesSent,
          reactions,
        },

        sessions: sessions.map((session) => ({
          id: String(session._id),

          ...(session.deviceName
            ? {
                deviceName: session.deviceName,
              }
            : {}),

          ...(session.platform
            ? {
                platform: session.platform,
              }
            : {}),

          ...(session.appVersion
            ? {
                appVersion: session.appVersion,
              }
            : {}),

          createdAt: session.createdAt.toISOString(),
          lastUsedAt: session.lastUsedAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),

          ...(session.revokedAt
            ? {
                revokedAt: session.revokedAt.toISOString(),
              }
            : {}),
        })),
      };
    },

    async setUserStatus(actorId, userId, status) {
      if (actorId === userId && status === 'disabled') {
        throw new AppError({
          code: 'ADMIN_SELF_DISABLE',
          message: 'You cannot disable your own admin account.',
          statusCode: 400,
        });
      }

      const { id } = await ensureTarget(userId);

      const user = await UserModel.findByIdAndUpdate(
        id,
        {
          $set: {
            status,
          },
        },
        {
          new: true,
        },
      ).lean();

      if (!user) {
        throw new AppError({
          code: 'USER_NOT_FOUND',
          message: 'User was not found.',
          statusCode: 404,
        });
      }

      if (status === 'disabled') {
        await SessionModel.updateMany(
          {
            userId: id,
            revokedAt: {
              $exists: false,
            },
          },
          {
            $set: {
              revokedAt: new Date(),
              revokeReason: 'admin_disabled_user',
            },
          },
        );
      }

      await AdminAuditModel.create({
        actorId: new Types.ObjectId(actorId),
        action: 'user.status_changed',
        targetUserId: id,
        metadata: {
          status,
        },
      });

      return mapAdminUser(user);
    },

    async revokeSessions(actorId, userId) {
      const { id } = await ensureTarget(userId);

      const result = await SessionModel.updateMany(
        {
          userId: id,
          revokedAt: {
            $exists: false,
          },
        },
        {
          $set: {
            revokedAt: new Date(),
            revokeReason: 'admin_revoked_sessions',
          },
        },
      );

      await AdminAuditModel.create({
        actorId: new Types.ObjectId(actorId),
        action: 'user.sessions_revoked',
        targetUserId: id,
        metadata: {
          revoked: result.modifiedCount,
        },
      });

      return result.modifiedCount;
    },

    async resetUserPassword(actorId, userId, newPassword) {
      if (actorId === userId) {
        throw new AppError({
          code: 'USE_SELF_PASSWORD_CHANGE',
          message: 'Use Change password to update your own password.',
          statusCode: 400,
        });
      }
      const { id, user } = await ensureTarget(userId);
      const now = new Date();
      const passwordHash = await passwordHasher.hash(newPassword);
      const revoked = await SessionModel.countDocuments({
        userId: id,
        revokedAt: { $exists: false },
        expiresAt: { $gt: now },
      });
      await Promise.all([
        UserModel.updateOne(
          { _id: id },
          { $set: { passwordHash, passwordChangedAt: now } },
        ),
        SessionModel.updateMany(
          { userId: id, revokedAt: { $exists: false } },
          { $set: { revokedAt: now, revokeReason: 'admin_password_reset' } },
        ),
      ]);
      await AdminAuditModel.create({
        actorId: new Types.ObjectId(actorId),
        action: 'user.password_reset',
        targetUserId: id,
        metadata: { email: user.emailDisplay, revokedSessions: revoked },
      });
      return { reset: true, revoked };
    },

    async deleteUser(actorId, userId) {
      if (actorId === userId) {
        throw new AppError({
          code: 'ADMIN_SELF_DELETE',
          message: 'You cannot delete your own admin account.',
          statusCode: 400,
        });
      }

      const { id, user } = await ensureTarget(userId);

      const sessions = await SessionModel.find({
        userId: id,
      })
        .select('_id')
        .lean();

      const sessionIds = sessions.map((session) => session._id);

      await Promise.all([
        RefreshTokenModel.deleteMany({
          sessionId: {
            $in: sessionIds,
          },
        }),

        SessionModel.deleteMany({
          userId: id,
        }),

        PasswordResetModel.deleteMany({
          userId: id,
        }),

        ConversationMemberModel.deleteMany({
          userId: id,
        }),

        MessageReactionModel.deleteMany({
          userId: id,
        }),

        MessageUserStateModel.deleteMany({
          userId: id,
        }),
      ]);

      await UserModel.deleteOne({
        _id: id,
      });

      await AdminAuditModel.create({
        actorId: new Types.ObjectId(actorId),
        action: 'user.deleted',
        targetUserId: id,
        metadata: {
          email: user.emailDisplay,
          displayName: user.displayName,
        },
      });

      return {
        deleted: true,
      };
    },

    async listAudit(limit) {
      const items = await AdminAuditModel.find({})
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .lean();

      return items.map((item) => ({
        id: String(item._id),
        actorId: String(item.actorId),
        action: item.action,

        ...(item.targetUserId
          ? {
              targetUserId: String(item.targetUserId),
            }
          : {}),

        metadata: item.metadata,
        createdAt: item.createdAt.toISOString(),
      }));
    },
  };
}
