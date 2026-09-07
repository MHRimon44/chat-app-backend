import request from 'supertest';

import { createApp } from '../src/app.js';
import type { AuthService } from '../src/auth/service.js';
import type { MessageService, MessageView } from '../src/messages/service.js';
import type { ReadinessProbe } from '../src/health/readiness.js';
import { createSilentLogger, createTestConfig } from './helpers.js';

const userId = '507f1f77bcf86cd799439011';
const conversationId = '507f1f77bcf86cd799439012';
const messageId = '507f191e810c19729de860ea';
const message: MessageView = {
  id: messageId,
  conversationId,
  senderId: userId,
  clientMessageId: '5d4ec3c7-9fb5-44d8-9a7b-29758ce3b6aa',
  kind: 'text',
  text: 'Hello',
  createdAt: '2026-08-27T12:00:00.000Z',
  reactions: [],
};
const readiness: ReadinessProbe = {
  check: async () => ({ checks: { mongo: 'up', redis: 'up' }, ready: true }),
};

function setup() {
  const auth = {
    authenticateAccess: jest.fn(async () => ({ userId, sessionId: 'session-1' })),
  } as unknown as AuthService;
  const messages: MessageService = {
    send: jest.fn(async () => message),
    history: jest.fn(async () => ({ items: [message], nextCursor: null, hasMore: false })),
    deleteForEveryone: jest.fn(async () => ({
      ...message,
      text: null,
      deletedAt: message.createdAt,
    })),
    deleteForMe: jest.fn(async () => undefined),
    setReaction: jest.fn(async (_actorId, id, emoji, active) => ({
      messageId: id,
      conversationId,
      userId,
      emoji,
      active,
      updatedAt: message.createdAt,
    })),
    changes: jest.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    advanceReceipt: jest.fn(async (_actorId, input) => ({
      conversationId: input.conversationId,
      userId,
      type: input.type,
      messageId: input.messageId,
      updatedAt: message.createdAt,
    })),
  };
  const app = createApp({
    auth,
    config: createTestConfig(),
    logger: createSilentLogger(),
    messages,
    readiness,
  });
  return { app, messages };
}

describe('message REST contracts', () => {
  it('sends a validated idempotent text message', async () => {
    const context = setup();

    const response = await request(context.app)
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', 'Bearer access-token')
      .send({ clientMessageId: message.clientMessageId, kind: 'text', text: 'Hello' })
      .expect(201);

    expect(response.body).toMatchObject({ data: { id: messageId, text: 'Hello' } });
    expect(context.messages.send).toHaveBeenCalledWith(userId, {
      conversationId,
      clientMessageId: message.clientMessageId,
      text: 'Hello',
    });
  });

  it('returns a stable reaction summary with history', async () => {
    const context = setup();
    const response = await request(context.app)
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', 'Bearer access-token')
      .expect(200);

    expect(response.body).toMatchObject({ data: [{ id: messageId, reactions: [] }] });
  });

  it('rejects unsupported reaction values before mutation', async () => {
    const context = setup();

    await request(context.app)
      .put(`/v1/messages/${messageId}/reactions/%F0%9F%92%A3`)
      .set('Authorization', 'Bearer access-token')
      .expect(422);

    expect(context.messages.setReaction).not.toHaveBeenCalled();
  });

  it('supports idempotent delete-for-me without revealing message content', async () => {
    const context = setup();

    await request(context.app)
      .delete(`/v1/messages/${messageId}/me`)
      .set('Authorization', 'Bearer access-token')
      .expect(204);

    expect(context.messages.deleteForMe).toHaveBeenCalledWith(userId, messageId);
  });

  it('validates durable change cursors as ObjectIds', async () => {
    const context = setup();

    await request(context.app)
      .get(`/v1/conversations/${conversationId}/changes?after=invalid`)
      .set('Authorization', 'Bearer access-token')
      .expect(422);

    expect(context.messages.changes).not.toHaveBeenCalled();
  });

  it('advances a validated seen receipt', async () => {
    const context = setup();
    const response = await request(context.app)
      .post(`/v1/conversations/${conversationId}/receipts`)
      .set('Authorization', 'Bearer access-token')
      .send({ messageId, type: 'seen' })
      .expect(200);

    expect(response.body).toMatchObject({ data: { messageId, type: 'seen' } });
    expect(context.messages.advanceReceipt).toHaveBeenCalledWith(userId, {
      conversationId,
      messageId,
      type: 'seen',
    });
  });
});
