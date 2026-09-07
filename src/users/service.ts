import { AppError } from '../errors/app-error.js';
import type { RateLimiter } from '../auth/ports.js';
import type { UserRepository } from './repository.js';
import type { UserProfile, UserSearchPage } from './types.js';

export interface UserService {
  getMe(userId: string): Promise<UserProfile>;
  getPublic(userId: string): Promise<UserProfile>;
  updateMe(
    userId: string,
    update: {
      username?: string;
      displayName?: string;
      bio?: string;
      presenceVisibility?: 'everyone' | 'contacts' | 'nobody';
    },
  ): Promise<UserProfile>;
  search(
    userId: string,
    input: { query: string; after?: string; limit: number },
  ): Promise<UserSearchPage>;
}

export function createUserService(
  repository: UserRepository,
  rateLimiter: RateLimiter,
): UserService {
  return {
    async getMe(userId) {
      const profile = await repository.getPrivateProfile(userId);
      if (!profile) throw notFound();
      return profile;
    },
    async getPublic(userId) {
      const profile = await repository.getPublicProfile(userId);
      if (!profile) throw notFound();
      return profile;
    },
    updateMe(userId, update) {
      return repository.updateProfile(userId, {
        ...(update.username ? { usernameNormalized: normalizeUsername(update.username) } : {}),
        ...(update.displayName ? { displayName: update.displayName.trim() } : {}),
        ...(update.bio !== undefined ? { bio: update.bio.trim() } : {}),
        ...(update.presenceVisibility ? { presenceVisibility: update.presenceVisibility } : {}),
      });
    },
    async search(userId, input) {
      const limited = await rateLimiter.consume({
        key: `user-search:${userId}`,
        limit: 60,
        windowSeconds: 60,
      });
      if (!limited.allowed)
        throw new AppError({
          code: 'RATE_LIMITED',
          details: { retryAfterSeconds: limited.retryAfterSeconds },
          message: 'Too many searches. Try again later.',
          statusCode: 429,
        });
      return repository.search({
        actorId: userId,
        query: normalizeUsername(input.query),
        ...(input.after ? { after: input.after } : {}),
        limit: input.limit,
      });
    },
  };
}

function normalizeUsername(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase();
}

function notFound(): AppError {
  return new AppError({ code: 'USER_NOT_FOUND', message: 'User was not found.', statusCode: 404 });
}
