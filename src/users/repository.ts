import { Types } from 'mongoose';

import { UserModel } from '../auth/models.js';
import { AppError } from '../errors/app-error.js';
import type { UserProfile, UserSearchPage } from './types.js';

export interface UserRepository {
  getPrivateProfile(userId: string): Promise<UserProfile | null>;
  getPublicProfile(userId: string): Promise<UserProfile | null>;
  updateProfile(
    userId: string,
    update: {
      usernameNormalized?: string;
      displayName?: string;
      bio?: string;
      presenceVisibility?: 'everyone' | 'contacts' | 'nobody';
    },
  ): Promise<UserProfile>;
  search(input: {
    actorId: string;
    query: string;
    after?: string;
    limit: number;
  }): Promise<UserSearchPage>;
}

export function createMongoUserRepository(): UserRepository {
  return {
    async getPrivateProfile(userId) {
      const value = await UserModel.findOne({ _id: userId, status: 'active' }).lean();
      return value ? mapUser(value, true) : null;
    },
    async getPublicProfile(userId) {
      const value = await UserModel.findOne({ _id: userId, status: 'active' }).lean();
      return value ? mapUser(value, false) : null;
    },
    async updateProfile(userId, update) {
      try {
        const value = await UserModel.findOneAndUpdate(
          { _id: userId, status: 'active' },
          { $set: update },
          { new: true, runValidators: true },
        ).lean();
        if (!value) throw profileNotFound();
        return mapUser(value, true);
      } catch (error) {
        if (isDuplicateError(error)) {
          throw new AppError({
            code: 'USERNAME_TAKEN',
            message: 'That username is unavailable.',
            statusCode: 409,
          });
        }
        throw error;
      }
    },
    async search({ actorId, query, after, limit }) {
      const filter: Record<string, unknown> = {
        _id: {
          $ne: new Types.ObjectId(actorId),
          ...(after ? { $gt: new Types.ObjectId(after) } : {}),
        },
        status: 'active',
        usernameNormalized: { $regex: `^${escapeRegex(query)}` },
      };
      const values = await UserModel.find(filter)
        .sort({ _id: 1 })
        .limit(limit + 1)
        .lean();
      const hasMore = values.length > limit;
      const page = values.slice(0, limit);
      return {
        items: page.map((value) => mapUser(value, false)),
        hasMore,
        nextCursor: hasMore && page.length > 0 ? String(page.at(-1)?._id) : null,
      };
    },
  };
}

function mapUser(
  value: {
    _id: unknown;
    usernameNormalized?: string | null;
    displayName: string;
    bio?: string | null;
    avatarKey?: string | null;
    presenceVisibility: 'everyone' | 'contacts' | 'nobody';
    emailDisplay: string;
    createdAt: Date;
  },
  privateView: boolean,
): UserProfile {
  return {
    id: String(value._id),
    ...(value.usernameNormalized ? { username: value.usernameNormalized } : {}),
    displayName: value.displayName,
    ...(value.bio ? { bio: value.bio } : {}),
    ...(value.avatarKey ? { avatarUrl: value.avatarKey } : {}),
    ...(privateView
      ? { presenceVisibility: value.presenceVisibility, email: value.emailDisplay }
      : {}),
    createdAt: value.createdAt.toISOString(),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
}

function profileNotFound(): AppError {
  return new AppError({ code: 'USER_NOT_FOUND', message: 'User was not found.', statusCode: 404 });
}
