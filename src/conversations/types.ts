import type { UserProfile } from '../users/types.js';

export type ConversationView = Readonly<{
  id: string;
  type: 'direct';
  counterpart: UserProfile;
  activityAt: string;
  hidden: boolean;
  notificationsEnabled: boolean;
  muteUntil?: string;
  unreadCount: number;
  lastDeliveredMessageId?: string;
  lastDeliveredAt?: string;
  lastSeenMessageId?: string;
  lastSeenAt?: string;
}>;

export type ConversationPage = Readonly<{
  items: readonly ConversationView[];
  nextCursor: string | null;
  hasMore: boolean;
}>;
