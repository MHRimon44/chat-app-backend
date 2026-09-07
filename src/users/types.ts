export type UserProfile = Readonly<{
  id: string;
  username?: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  presenceVisibility?: 'everyone' | 'contacts' | 'nobody';
  email?: string;
  createdAt: string;
}>;

export type UserSearchPage = Readonly<{
  items: readonly UserProfile[];
  nextCursor: string | null;
  hasMore: boolean;
}>;
