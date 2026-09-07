import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { model, models, Schema } = mongoose;
export interface ConversationDocument {
  _id: Types.ObjectId;
  type: 'direct';
  directKey: string;
  createdBy: Types.ObjectId;
  activityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMemberDocument {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'member';
  joinedAt: Date;
  hiddenAt?: Date;
  sortAt: Date;
  muteUntil?: Date;
  notificationsEnabled: boolean;
  unreadCount: number;
  lastDeliveredMessageId?: Types.ObjectId;
  lastDeliveredAt?: Date;
  lastSeenMessageId?: Types.ObjectId;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationDocument>(
  {
    type: { type: String, enum: ['direct'], required: true },
    directKey: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    activityAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: 'version' },
);
conversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { type: 'direct' } },
);
conversationSchema.index({ activityAt: -1, _id: -1 });

const memberSchema = new Schema<ConversationMemberDocument>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ['member'], default: 'member', required: true },
    joinedAt: { type: Date, required: true },
    hiddenAt: Date,
    sortAt: { type: Date, required: true },
    muteUntil: Date,
    notificationsEnabled: { type: Boolean, default: true, required: true },
    unreadCount: { type: Number, default: 0, min: 0, required: true },
    lastDeliveredMessageId: Schema.Types.ObjectId,
    lastDeliveredAt: Date,
    lastSeenMessageId: Schema.Types.ObjectId,
    lastSeenAt: Date,
  },
  { timestamps: true, versionKey: 'version' },
);
memberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
memberSchema.index({ userId: 1, hiddenAt: 1, sortAt: -1, _id: -1 });
memberSchema.index({ conversationId: 1 });

export const ConversationModel: Model<ConversationDocument> =
  (models.Conversation as Model<ConversationDocument> | undefined) ??
  model<ConversationDocument>('Conversation', conversationSchema);
export const ConversationMemberModel: Model<ConversationMemberDocument> =
  (models.ConversationMember as Model<ConversationMemberDocument> | undefined) ??
  model<ConversationMemberDocument>('ConversationMember', memberSchema);
