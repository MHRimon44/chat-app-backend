import { createServer } from 'node:http';

import pino from 'pino';
import { io as createClient, type Socket } from 'socket.io-client';

import type { AuthService } from '../src/auth/service.js';
import type { MessageService, MessageView } from '../src/messages/service.js';
import { createRealtimeServer } from '../src/realtime/socket-server.js';

const userId = '507f1f77bcf86cd799439011';
const recipientId = '507f1f77bcf86cd799439013';
const conversationId = '507f1f77bcf86cd799439012';
const message: MessageView = {
  id: '507f191e810c19729de860ea',
  conversationId,
  senderId: userId,
  clientMessageId: '5d4ec3c7-9fb5-44d8-9a7b-29758ce3b6aa',
  kind: 'text',
  text: 'Hello',
  createdAt: '2026-08-27T12:00:00.000Z',
  reactions: [],
};

describe('Socket.IO authentication and messaging', () => {
  let client: Socket | undefined;
  let recipient: Socket | undefined;
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    client?.disconnect();
    recipient?.disconnect();
    await close?.();
  });

  it('authenticates two users, acknowledges an idempotent send, and privately delivers it', async () => {
    const server = createServer();
    const auth = {
      authenticateAccess: jest.fn(async (token: string) => ({
        userId: token === 'recipient-access-token' ? recipientId : userId,
        sessionId: token === 'recipient-access-token' ? 'session-2' : 'session-1',
      })),
    } as unknown as AuthService;
    const messages = {
      send: jest.fn(async () => message),
    } as unknown as MessageService;
    const realtime = await createRealtimeServer({
      server,
      config: { corsAllowedOrigins: ['https://app.example'], redisUrl: 'redis://localhost:6379' },
      auth,
      messages,
      logger: pino({ level: 'silent' }),
      enableRedisAdapter: false,
      loadConversationIds: async () => [conversationId],
      loadParticipantIds: async () => [userId, recipientId],
      loadPresenceVisibility: async () => 'contacts',
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address.');
    close = async () => {
      await realtime.disconnect();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    };
    client = createClient(`http://127.0.0.1:${address.port}`, {
      auth: { accessToken: 'valid-access-token' },
      transports: ['websocket'],
    });
    recipient = createClient(`http://127.0.0.1:${address.port}`, {
      auth: { accessToken: 'recipient-access-token' },
      transports: ['websocket'],
    });
    await once(client, 'connect');
    await once(recipient, 'connect');
    const emitted = once(recipient, 'message:created');
    const acknowledgement = await new Promise<unknown>((resolve) => {
      client?.emit(
        'message:send',
        { conversationId, clientMessageId: message.clientMessageId, kind: 'text', text: 'Hello' },
        resolve,
      );
    });

    expect(acknowledgement).toMatchObject({ ok: true, data: { id: message.id } });
    await expect(emitted).resolves.toMatchObject({ id: message.id, text: 'Hello' });
    expect(messages.send).toHaveBeenCalledWith(userId, {
      conversationId,
      clientMessageId: message.clientMessageId,
      text: 'Hello',
    });
  });
});

function once(socket: Socket, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}.`)), 2_000);
    socket.once(event, (value: unknown) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
}
