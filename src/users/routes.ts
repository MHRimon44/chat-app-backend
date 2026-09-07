import { Router } from 'express';
import { z } from 'zod';

import { getAuthContext, requireAccessToken } from '../auth/middleware.js';
import type { AuthService } from '../auth/service.js';
import type { UserService } from './service.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const updateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_]{3,30}$/)
      .optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(160).optional(),
    presenceVisibility: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field is required.');
const searchSchema = z.object({
  q: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{2,30}$/),
  cursor: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export function createUserRouter(auth: AuthService, users: UserService): Router {
  const router = Router();
  router.use(requireAccessToken(auth));

  router.get('/me', async (_request, response) => {
    const actor = getAuthContext(response.locals);
    response.json({ data: await users.getMe(actor.userId) });
  });

  router.patch('/me', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const input = updateSchema.parse(request.body);
    response.json({
      data: await users.updateMe(actor.userId, {
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.presenceVisibility !== undefined
          ? { presenceVisibility: input.presenceVisibility }
          : {}),
      }),
    });
  });

  router.get('/search', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const query = searchSchema.parse(request.query);
    const page = await users.search(actor.userId, {
      query: query.q,
      ...(query.cursor ? { after: query.cursor } : {}),
      limit: query.limit,
    });
    response.json({
      data: page.items,
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
    });
  });

  router.get('/:userId', async (request, response) => {
    const userId = objectIdSchema.parse(request.params.userId);
    response.json({ data: await users.getPublic(userId) });
  });

  return router;
}
