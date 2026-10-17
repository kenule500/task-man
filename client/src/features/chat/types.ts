export type ChannelKind = 'team' | 'general' | 'project' | 'direct';

/** A channel as the API returns it. */
export interface ChatChannel {
  _id: string;
  kind: ChannelKind;
  name: string;
  project?: string | null;
  participants: string[];
  archived: boolean;
  lastMessageAt?: string | null;
  lastMessageAuthor?: ChatUser | string | null;
  createdAt: string;
  updatedAt: string;
}

/** People are populated onto messages by the API. */
export interface ChatUser {
  _id: string;
  name: string;
  avatarUrl?: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ChatMessage {
  _id: string;
  channel: string;
  author: ChatUser | string;
  body: string;
  parent?: string | null;
  mentions: string[];
  attachments: ChatAttachment[];
  replyCount: number;
  lastReplyAuthor?: ChatUser | string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface MessagePage {
  messages: ChatMessage[];
  nextCursor: string | null;
}

export interface SearchPage {
  results: ChatMessage[];
  nextCursor: string | null;
}

export interface OutgoingMessage {
  channelId: string;
  body: string;
  parentId?: string | null;
  mentionIds?: string[];
  attachmentIds?: string[];
}

export interface SocketAck {
  ok: boolean;
  error?: string;
  message?: ChatMessage;
}

/** Who is connected, by user id. */
export type PresenceMap = Record<string, boolean>;

export const authorOf = (message: ChatMessage): ChatUser | null =>
  typeof message.author === 'string' ? null : message.author;

export const authorName = (message: ChatMessage): string => authorOf(message)?.name ?? 'Someone';
