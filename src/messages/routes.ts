import { Router } from 'express';
import { z } from 'zod';

import { getAuthContext, requireAccessToken } from '../auth/middleware.js';
import type { AuthService } from '../auth/service.js';
import type { MessageService } from './service.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const conversationParams = z.object({ conversationId: id });
const messageParams = z.object({ messageId: id });
const reactionParams = z.object({
  messageId: id,
  emoji: z.enum(['👍', '❤️', '😂', '😮', '😢', '🙏']),
});
const sendSchema = z.object({
  clientMessageId: z.uuid(),
  kind: z.literal('text'),
  text: z.string().trim().min(1).max(4_000),
  replyToMessageId: id.optional(),
});
const historySchema = z.object({
  before: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const changesSchema = z.object({
  after: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
const receiptSchema = z.object({
  messageId: id,
  type: z.enum(['delivered', 'seen']),
});

export function createMessageRouters(
  auth: AuthService,
  messages: MessageService,
): {
  conversationMessages: Router;
  conversationChanges: Router;
  conversationReceipts: Router;
  messages: Router;
} {
  const conversationMessages = Router({ mergeParams: true });
  const conversationChanges = Router({ mergeParams: true });
  const conversationReceipts = Router({ mergeParams: true });
  const messageRouter = Router();
  conversationMessages.use(requireAccessToken(auth));
  conversationChanges.use(requireAccessToken(auth));
  conversationReceipts.use(requireAccessToken(auth));
  messageRouter.use(requireAccessToken(auth));

  conversationMessages.get('/', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { conversationId } = conversationParams.parse(request.params);
    const query = historySchema.parse(request.query);
    const page = await messages.history(actor.userId, {
      conversationId,
      ...(query.before ? { before: query.before } : {}),
      limit: query.limit,
    });
    response.json({
      data: page.items,
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
    });
  });

  conversationMessages.post('/', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { conversationId } = conversationParams.parse(request.params);
    const input = sendSchema.parse(request.body);
    response.status(201).json({
      data: await messages.send(actor.userId, {
        conversationId,
        clientMessageId: input.clientMessageId,
        text: input.text,
        ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
      }),
    });
  });

  conversationChanges.get('/', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { conversationId } = conversationParams.parse(request.params);
    const query = changesSchema.parse(request.query);
    const page = await messages.changes(actor.userId, {
      conversationId,
      ...(query.after ? { after: query.after } : {}),
      limit: query.limit,
    });
    response.json({
      data: page.items,
      page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
    });
  });

  conversationReceipts.post('/', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { conversationId } = conversationParams.parse(request.params);
    const input = receiptSchema.parse(request.body);
    response.json({
      data: await messages.advanceReceipt(actor.userId, {
        conversationId,
        messageId: input.messageId,
        type: input.type,
      }),
    });
  });

  messageRouter.delete('/:messageId/everyone', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { messageId } = messageParams.parse(request.params);
    response.json({ data: await messages.deleteForEveryone(actor.userId, messageId) });
  });

  messageRouter.delete('/:messageId/me', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { messageId } = messageParams.parse(request.params);
    await messages.deleteForMe(actor.userId, messageId);
    response.status(204).send();
  });

  messageRouter.put('/:messageId/reactions/:emoji', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { messageId, emoji } = reactionParams.parse(request.params);
    response.json({ data: await messages.setReaction(actor.userId, messageId, emoji, true) });
  });

  messageRouter.delete('/:messageId/reactions/:emoji', async (request, response) => {
    const actor = getAuthContext(response.locals);
    const { messageId, emoji } = reactionParams.parse(request.params);
    response.json({ data: await messages.setReaction(actor.userId, messageId, emoji, false) });
  });

  return {
    conversationChanges,
    conversationMessages,
    conversationReceipts,
    messages: messageRouter,
  };
}
