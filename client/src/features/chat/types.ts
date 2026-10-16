export type ChannelType = 'team' | 'project' | 'dm';

export interface ChatUser {
  _id: string;
  name: string;
  avatarUrl: string;
}

export interface ChatMessage {
  _id: string;
  channel: string;
  author: ChatUser;
  /** Plain text; empty for a deleted message */
  text: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

export interface LastMessage {
  _id: string;
  text: string;
  createdAt: string;
  author: { _id: string; name: string };
}

export interface ChatChannel {
  _id: string;
  workspace: string;
  name: string;
  slug: string;
  type: ChannelType;
  project: string;
  private: boolean;
  /** The default #general channel (cannot be renamed or archived) */
  isDefault: boolean;
  createdBy: string | null;
  lastMessageAt: string | null;
  /** Direct messages and private channels: who belongs */
  memberIds: string[];
  members: ChatUser[];
  unread: number;
  lastMessage: LastMessage | null;
}

export interface ChannelList {
  channels: ChatChannel[];
  unreadTotal: number;
}

export interface MessagePage {
  messages: ChatMessage[];
  /** History: older messages exist. Polling: more new messages than one page. */
  hasMore: boolean;
  cursor: string;
  serverTime: string;
  /** Polling only: edits and deletions since `changedSince` */
  changes?: ChatMessage[];
}

/** A short notice that something was posted in a channel (sent to everyone who can see the channel). */
export interface ChatActivity {
  workspace: string;
  channelId: string;
  messageId: string;
  authorId: string;
  authorName: string;
  preview: string;
  createdAt: string;
  mentions: string[];
}

export interface TypingEvent {
  channelId: string;
  user: { _id: string; name: string };
}

export interface PresenceUpdate {
  workspace: string;
  userId: string;
  online: boolean;
}

export type ChannelEvent =
  | { action: 'created' | 'updated'; channel: ChatChannel }
  | { action: 'archived'; channel: { _id: string } };

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'offline';

/** People who can be mentioned or messaged (public profile only) */
export type ChatMember = ChatUser;
