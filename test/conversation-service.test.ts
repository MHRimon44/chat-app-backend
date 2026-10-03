import { createConversationService } from '../src/conversations/service.js';
import type { ConversationRepository } from '../src/conversations/repository.js';
import type { UserRepository } from '../src/users/repository.js';
import type { ConversationView } from '../src/conversations/types.js';

const actorId = '507f1f77bcf86cd799439011';
const otherUserId = '507f191e810c19729de860ea';
const conversationId = '507f1f77bcf86cd799439012';
const view: ConversationView = {
  id: conversationId,
  type: 'direct',
  counterpart: {
    id: otherUserId,
    username: 'sara',
    displayName: 'Sara',
    createdAt: '2026-08-27T12:00:00.000Z',
  },
  activityAt: '2026-08-27T12:00:00.000Z',
  hidden: false,
  notificationsEnabled: true,
  unreadCount: 0,
};

function setup(userExists = true) {
  const conversations: ConversationRepository = {
    createDirect: jest.fn(async () => view),
    getForMember: jest.fn(async () => view),
    list: jest.fn(async () => ({ items: [view], nextCursor: null, hasMore: false })),
    listHidden: jest.fn(async () => ({ items: [], hasMore: false, nextCursor: null })), 
    setHidden: jest.fn(async () => undefined),
    updateSettings: jest.fn(async () => view),
  };
  const users: UserRepository = {
    getPrivateProfile: jest.fn(async () => null),
    getPublicProfile: jest.fn(async () =>
      userExists
        ? { id: otherUserId, username: 'sara', displayName: 'Sara', createdAt: view.activityAt }
        : null,
    ),
    updateProfile: jest.fn(),
    search: jest.fn(),
  };
  const now = new Date('2026-08-27T12:00:00.000Z');
  return { conversations, service: createConversationService(conversations, users, () => now) };
}

describe('conversation service', () => {
  it('creates a direct conversation only with an active different user', async () => {
    const context = setup();

    await expect(context.service.createDirect(actorId, otherUserId)).resolves.toEqual(view);
    expect(context.conversations.createDirect).toHaveBeenCalledWith(
      actorId,
      otherUserId,
      new Date('2026-08-27T12:00:00.000Z'),
    );
  });

  it('rejects self-conversations', async () => {
    const context = setup();

    await expect(context.service.createDirect(actorId, actorId)).rejects.toMatchObject({
      code: 'INVALID_PARTICIPANT',
    });
    expect(context.conversations.createDirect).not.toHaveBeenCalled();
  });

  it('does not reveal conversations to non-members', async () => {
    const context = setup();
    jest.mocked(context.conversations.getForMember).mockResolvedValueOnce(null);

    await expect(context.service.get(actorId, conversationId)).rejects.toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('rejects direct creation when the other user is unavailable', async () => {
    const context = setup(false);

    await expect(context.service.createDirect(actorId, otherUserId)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });
});
