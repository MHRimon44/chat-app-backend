import { createUserService } from '../src/users/service.js';
import type { UserRepository } from '../src/users/repository.js';
import type { RateLimiter } from '../src/auth/ports.js';

const profile = {
  id: '507f1f77bcf86cd799439011',
  username: 'mehedi',
  displayName: 'Mehedi Hasan',
  email: 'mehedi@example.com',
  presenceVisibility: 'everyone' as const,
  createdAt: '2026-08-27T12:00:00.000Z',
};

function setup(allowed = true) {
  const repository: UserRepository = {
    getPrivateProfile: jest.fn(async () => profile),
    getPublicProfile: jest.fn(async () => profile),
    updateProfile: jest.fn(async () => profile),
    search: jest.fn(async () => ({ items: [profile], nextCursor: null, hasMore: false })),
  };
  const limiter: RateLimiter = {
    consume: jest.fn(async () => ({ allowed, retryAfterSeconds: 20 })),
  };
  return { repository, service: createUserService(repository, limiter) };
}

describe('user service', () => {
  it('normalizes usernames and trims mutable profile fields', async () => {
    const context = setup();

    await context.service.updateMe(profile.id, {
      username: ' MeHeDi_1 ',
      displayName: ' Mehedi ',
      bio: ' Hello ',
    });

    expect(context.repository.updateProfile).toHaveBeenCalledWith(profile.id, {
      usernameNormalized: 'mehedi_1',
      displayName: 'Mehedi',
      bio: 'Hello',
    });
  });

  it('normalizes bounded username search and excludes transport concerns', async () => {
    const context = setup();

    await context.service.search(profile.id, { query: ' MEH ', limit: 30 });

    expect(context.repository.search).toHaveBeenCalledWith({
      actorId: profile.id,
      query: 'meh',
      limit: 30,
    });
  });

  it('rejects search after the distributed per-user limit', async () => {
    const context = setup(false);

    await expect(
      context.service.search(profile.id, { query: 'meh', limit: 30 }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: 20 },
    });
  });
});
