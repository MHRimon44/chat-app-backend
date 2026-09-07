import mongoose, { Types } from 'mongoose';

import { UserModel } from '../auth/models.js';
import { AppError } from '../errors/app-error.js';
import { ConversationMemberModel, ConversationModel } from './models.js';
import type { ConversationPage, ConversationView } from './types.js';

export interface ConversationRepository {
  createDirect(actorId: string, otherUserId: string, now: Date): Promise<ConversationView>;
  getForMember(actorId: string, conversationId: string): Promise<ConversationView | null>;
  list(actorId: string, input: { cursor?: string; limit: number }): Promise<ConversationPage>;
  setHidden(actorId: string, conversationId: string, hidden: boolean, now: Date): Promise<void>;
  updateSettings(
    actorId: string,
    conversationId: string,
    input: { notificationsEnabled?: boolean; muteUntil?: Date | null },
  ): Promise<ConversationView>;
}

export function createMongoConversationRepository(): ConversationRepository {
  return {
    async createDirect(actorId, otherUserId, now) {
      const directKey = canonicalDirectKey(actorId, otherUserId);
      try {
        const conversationId = await mongoose.connection.transaction(async (transaction) => {
          const [conversation] = await ConversationModel.create(
            [{ type: 'direct', directKey, createdBy: actorId, activityAt: now }],
            { session: transaction },
          );
          if (!conversation) throw new Error('Conversation creation returned no record.');
          await ConversationMemberModel.create(
            [actorId, otherUserId].map((userId) => ({
              conversationId: conversation._id,
              userId,
              joinedAt: now,
              sortAt: now,
              notificationsEnabled: true,
              unreadCount: 0,
            })),
            { session: transaction, ordered: true },
          );
          return String(conversation._id);
        });
        const created = await getView(actorId, conversationId);
        if (!created) throw new Error('Created conversation could not be loaded.');
        return created;
      } catch (error) {
        if (!isDuplicateError(error)) throw error;
        const existing = await ConversationModel.findOne({ directKey, type: 'direct' }).lean();
        if (!existing) throw error;
        await ConversationMemberModel.updateOne(
          { conversationId: existing._id, userId: actorId },
          { $unset: { hiddenAt: 1 } },
        );
        const view = await getView(actorId, String(existing._id));
        if (!view) throw error;
        return view;
      }
    },
    getForMember: getView,
    async list(actorId, input) {
      const decoded = input.cursor ? decodeCursor(input.cursor) : null;
      const cursorFilter = decoded
        ? {
            $or: [
              { sortAt: { $lt: decoded.sortAt } },
              { sortAt: decoded.sortAt, _id: { $lt: new Types.ObjectId(decoded.id) } },
            ],
          }
        : {};
      const members = await ConversationMemberModel.find({
        userId: actorId,
        hiddenAt: { $exists: false },
        ...cursorFilter,
      })
        .sort({ sortAt: -1, _id: -1 })
        .limit(input.limit + 1)
        .lean();
      const hasMore = members.length > input.limit;
      const page = members.slice(0, input.limit);
      const views = await Promise.all(
        page.map((member) => getView(actorId, String(member.conversationId))),
      );
      const items = views.filter((value): value is ConversationView => value !== null);
      const tail = page.at(-1);
      return {
        items,
        hasMore,
        nextCursor: hasMore && tail ? encodeCursor(tail.sortAt, String(tail._id)) : null,
      };
    },
    async setHidden(actorId, conversationId, hidden, now) {
      const result = await ConversationMemberModel.updateOne(
        { conversationId, userId: actorId },
        hidden ? { $set: { hiddenAt: now } } : { $unset: { hiddenAt: 1 } },
      );
      if (result.matchedCount !== 1) throw notFound();
    },
    async updateSettings(actorId, conversationId, input) {
      const set: Record<string, unknown> = {};
      if (input.notificationsEnabled !== undefined)
        set.notificationsEnabled = input.notificationsEnabled;
      if (input.muteUntil) set.muteUntil = input.muteUntil;
      const operation = {
        ...(Object.keys(set).length > 0 ? { $set: set } : {}),
        ...(input.muteUntil === null ? { $unset: { muteUntil: 1 } } : {}),
      };
      const member = await ConversationMemberModel.findOneAndUpdate(
        { conversationId, userId: actorId },
        operation,
        { new: true, runValidators: true },
      );
      if (!member) throw notFound();
      const view = await getView(actorId, conversationId);
      if (!view) throw notFound();
      return view;
    },
  };
}

async function getView(actorId: string, conversationId: string): Promise<ConversationView | null> {
  const membership = await ConversationMemberModel.findOne({
    conversationId,
    userId: actorId,
  }).lean();
  if (!membership) return null;
  const conversation = await ConversationModel.findById(conversationId).lean();
  if (!conversation) return null;
  const counterpartMember = await ConversationMemberModel.findOne({
    conversationId,
    userId: { $ne: new Types.ObjectId(actorId) },
  }).lean();
  if (!counterpartMember) return null;
  const counterpart = await UserModel.findOne({
    _id: counterpartMember.userId,
    status: 'active',
  }).lean();
  if (!counterpart) return null;
  return {
    id: String(conversation._id),
    type: 'direct',
    counterpart: {
      id: String(counterpart._id),
      ...(counterpart.usernameNormalized ? { username: counterpart.usernameNormalized } : {}),
      displayName: counterpart.displayName,
      ...(counterpart.bio ? { bio: counterpart.bio } : {}),
      ...(counterpart.avatarKey ? { avatarUrl: counterpart.avatarKey } : {}),
      createdAt: counterpart.createdAt.toISOString(),
    },
    activityAt: conversation.activityAt.toISOString(),
    hidden: Boolean(membership.hiddenAt),
    notificationsEnabled: membership.notificationsEnabled,
    unreadCount: membership.unreadCount ?? 0,
    ...(membership.lastDeliveredMessageId
      ? { lastDeliveredMessageId: String(membership.lastDeliveredMessageId) }
      : {}),
    ...(membership.lastDeliveredAt
      ? { lastDeliveredAt: membership.lastDeliveredAt.toISOString() }
      : {}),
    ...(membership.lastSeenMessageId
      ? { lastSeenMessageId: String(membership.lastSeenMessageId) }
      : {}),
    ...(membership.lastSeenAt ? { lastSeenAt: membership.lastSeenAt.toISOString() } : {}),
    ...(membership.muteUntil ? { muteUntil: membership.muteUntil.toISOString() } : {}),
  };
}

function canonicalDirectKey(first: string, second: string): string {
  return [first, second].sort().join(':');
}

function encodeCursor(sortAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ sortAt: sortAt.toISOString(), id }), 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(cursor: string): { sortAt: Date; id: string } {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof value !== 'object' ||
      value === null ||
      !('sortAt' in value) ||
      !('id' in value) ||
      typeof value.sortAt !== 'string' ||
      typeof value.id !== 'string' ||
      !Types.ObjectId.isValid(value.id)
    )
      throw new Error('Invalid cursor.');
    const sortAt = new Date(value.sortAt);
    if (Number.isNaN(sortAt.getTime())) throw new Error('Invalid cursor date.');
    return { sortAt, id: value.id };
  } catch {
    throw new AppError({ code: 'INVALID_CURSOR', message: 'Cursor is invalid.', statusCode: 400 });
  }
}

function isDuplicateError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
}

function notFound(): AppError {
  return new AppError({
    code: 'CONVERSATION_NOT_FOUND',
    message: 'Conversation was not found.',
    statusCode: 404,
  });
}
