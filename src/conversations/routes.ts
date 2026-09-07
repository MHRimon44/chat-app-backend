import { Router } from 'express';
import { z } from 'zod';

import { getAuthContext, requireAccessToken } from '../auth/middleware.js';
import type { AuthService } from '../auth/service.js';
import type { ConversationService } from './service.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const directSchema = z.object({ otherUserId: objectIdSchema });
const paramsSchema = z.object({ conversationId: objectIdSchema });
const listSchema = z.object({
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
const settingsSchema = z
  .object({
    notificationsEnabled: z.boolean().optional(),
    muteUntil: z.iso.datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one setting is required.');

export function createConversationRouter(auth: AuthService, service: ConversationService): Router {
  const router = Router();
  router.use(requireAccessToken(auth));

  router.post('/direct', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const input = directSchema.parse(request.body);
    response
      .status(201)
      .json({ data: await service.createDirect(actor.userId, input.otherUserId) });
  });

  router.get('/', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const query = listSchema.parse(request.query);
    const page = await service.list(actor.userId, {
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: query.limit,
    });
    response.json({
      data: page.items,
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
    });
  });

  router.get('/:conversationId', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { conversationId } = paramsSchema.parse(request.params);
    response.json({ data: await service.get(actor.userId, conversationId) });
  });

  router.post('/:conversationId/hide', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { conversationId } = paramsSchema.parse(request.params);
    await service.setHidden(actor.userId, conversationId, true);
    response.status(204).send();
  });

  router.post('/:conversationId/unhide', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { conversationId } = paramsSchema.parse(request.params);
    await service.setHidden(actor.userId, conversationId, false);
    response.status(204).send();
  });

  router.patch('/:conversationId/settings', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { conversationId } = paramsSchema.parse(request.params);
    const input = settingsSchema.parse(request.body);
    response.json({
      data: await service.updateSettings(actor.userId, conversationId, {
        ...(input.notificationsEnabled !== undefined
          ? { notificationsEnabled: input.notificationsEnabled }
          : {}),
        ...(input.muteUntil !== undefined
          ? { muteUntil: input.muteUntil === null ? null : new Date(input.muteUntil) }
          : {}),
      }),
    });
  });

  return router;
}
