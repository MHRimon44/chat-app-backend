import { Types } from 'mongoose';

import { SessionModel, UserModel, type UserDocument } from '../auth/models.js';
import { AppError } from '../errors/app-error.js';

export type AdminUser = Readonly<{
  id: string;
  email: string;
  username?: string;
  displayName: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastSeenAt?: string;
}>;

export interface AdminService {
  assertAdmin(userId: string): Promise<void>;

  dashboard(): Promise<{
    totalUsers: number;
    activeUsers: number;
    disabledUsers: number;
    newUsersToday: number;
    activeSessions: number;
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

  setUserStatus(actorId: string, userId: string, status: 'active' | 'disabled'): Promise<AdminUser>;

  revokeSessions(actorId: string, userId: string): Promise<number>;
}

type AdminUserSource = Pick<
  UserDocument,
  | '_id'
  | 'emailDisplay'
  | 'usernameNormalized'
  | 'displayName'
  | 'status'
  | 'createdAt'
  | 'lastSeenAt'
>;

type UserFilter = {
  status?: 'active' | 'disabled';
  $or?: Array<{
    emailDisplay?: {
      $regex: string;
      $options: 'i';
    };
    displayName?: {
      $regex: string;
      $options: 'i';
    };
    usernameNormalized?: {
      $regex: string;
      $options: 'i';
    };
  }>;
};

function mapAdminUser(user: AdminUserSource): AdminUser {
  return {
    id: String(user._id),
    email: user.emailDisplay,
    ...(user.usernameNormalized ? { username: user.usernameNormalized } : {}),
    displayName: user.displayName,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    ...(user.lastSeenAt ? { lastSeenAt: user.lastSeenAt.toISOString() } : {}),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createAdminService(adminEmails: readonly string[]): AdminService {
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

  return {
    assertAdmin,

    async dashboard() {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const now = new Date();

      const [totalUsers, activeUsers, disabledUsers, newUsersToday, activeSessions] =
        await Promise.all([
          UserModel.countDocuments({}),
          UserModel.countDocuments({ status: 'active' }),
          UserModel.countDocuments({ status: 'disabled' }),
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
        ]);

      return {
        totalUsers,
        activeUsers,
        disabledUsers,
        newUsersToday,
        activeSessions,
      };
    },

    async listUsers({ query, status, page, limit }) {
      const filter: UserFilter = {};

      if (status !== undefined) {
        filter.status = status;
      }

      const trimmedQuery = query?.trim();

      if (trimmedQuery) {
        const escapedQuery = escapeRegex(trimmedQuery);

        filter.$or = [
          {
            emailDisplay: {
              $regex: escapedQuery,
              $options: 'i',
            },
          },
          {
            displayName: {
              $regex: escapedQuery,
              $options: 'i',
            },
          },
          {
            usernameNormalized: {
              $regex: escapedQuery,
              $options: 'i',
            },
          },
        ];
      }

      const [values, total] = await Promise.all([
        UserModel.find(filter)
          .sort({ createdAt: -1 })
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

    async setUserStatus(actorId, userId, status) {
      if (!Types.ObjectId.isValid(userId)) {
        throw new AppError({
          code: 'USER_NOT_FOUND',
          message: 'User was not found.',
          statusCode: 404,
        });
      }

      if (actorId === userId && status === 'disabled') {
        throw new AppError({
          code: 'ADMIN_SELF_DISABLE',
          message: 'You cannot disable your own admin account.',
          statusCode: 400,
        });
      }

      const user = await UserModel.findByIdAndUpdate(
        userId,
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
            userId: new Types.ObjectId(userId),
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

      return mapAdminUser(user);
    },

    async revokeSessions(_actorId, userId) {
      if (!Types.ObjectId.isValid(userId)) {
        throw new AppError({
          code: 'USER_NOT_FOUND',
          message: 'User was not found.',
          statusCode: 404,
        });
      }

      const result = await SessionModel.updateMany(
        {
          userId: new Types.ObjectId(userId),
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

      return result.modifiedCount;
    },
  };
}
