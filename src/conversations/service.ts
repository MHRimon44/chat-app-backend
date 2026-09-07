import { AppError } from '../errors/app-error.js';
import type { UserRepository } from '../users/repository.js';
import type { ConversationRepository } from './repository.js';
import type { ConversationPage, ConversationView } from './types.js';

export interface ConversationService {
  createDirect(actorId: string, otherUserId: string): Promise<ConversationView>;
  get(actorId: string, conversationId: string): Promise<ConversationView>;
  list(actorId: string, input: { cursor?: string; limit: number }): Promise<ConversationPage>;
  setHidden(actorId: string, conversationId: string, hidden: boolean): Promise<void>;
  updateSettings(
    actorId: string,
    conversationId: string,
    input: { notificationsEnabled?: boolean; muteUntil?: Date | null },
  ): Promise<ConversationView>;
}

export function createConversationService(
  conversations: ConversationRepository,
  users: UserRepository,
  now: () => Date = () => new Date(),
): ConversationService {
  return {
    async createDirect(actorId, otherUserId) {
      if (actorId === otherUserId)
        throw new AppError({
          code: 'INVALID_PARTICIPANT',
          message: 'A direct conversation requires another user.',
          statusCode: 422,
        });
      if (!(await users.getPublicProfile(otherUserId)))
        throw new AppError({
          code: 'USER_NOT_FOUND',
          message: 'User was not found.',
          statusCode: 404,
        });
      return conversations.createDirect(actorId, otherUserId, now());
    },
    async get(actorId, conversationId) {
      const conversation = await conversations.getForMember(actorId, conversationId);
      if (!conversation) throw notFound();
      return conversation;
    },
    list(actorId, input) {
      return conversations.list(actorId, input);
    },
    setHidden(actorId, conversationId, hidden) {
      return conversations.setHidden(actorId, conversationId, hidden, now());
    },
    updateSettings(actorId, conversationId, input) {
      return conversations.updateSettings(actorId, conversationId, input);
    },
  };
}

function notFound(): AppError {
  return new AppError({
    code: 'CONVERSATION_NOT_FOUND',
    message: 'Conversation was not found.',
    statusCode: 404,
  });
}
