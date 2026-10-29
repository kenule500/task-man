export type ChannelKind = 'team' | 'general' | 'project' | 'direct';

/** A channel as the API returns it. */
export interface ChatChannel {
  _id: string;
  kind: ChannelKind;
  name: string;
  /** What the channel is for; empty for direct conversations. */
  description: string;
  /** True only for the two default channels; project channels belong to the chat screen's team list. */
  mainMenu?: boolean;
  /** How many people can read this channel: workspace members, project members, or the two participants. */
  memberCount?: number;
  /** True when the channel has messages newer than the caller's last visit. */
  unread?: boolean;
  /** How many messages are newer than the caller's last visit. */
  unreadCount?: number;
  avatarUrl?: string | null;
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

/**
 * The parent summary the server emits after a reply is stored (AC-115). It carries the authoritative
 * post-increment count, so a client never has to guess a delta from an event it might have missed.
 */
export interface ChatThreadUpdate {
  channelId: string;
  messageId: string;
  replyCount: number;
  lastReplyAuthor?: ChatUser | string | null;
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
  /** The parent summary of a reply, so its author sees the new count without the room event (AC-123). */
  thread?: ChatThreadUpdate | null;
}

/**
 * What a send resolves with on either transport: the stored message, plus the parent summary when the
 * message was a reply, so the author's count is as live as everyone else's (AC-123).
 */
export interface SentResult {
  message: ChatMessage;
  thread: ChatThreadUpdate | null;
}

/** One row of a conversation section (direct messages and team channels share the shape). */
export interface ConversationCard {
  _id: string;
  name: string;
  project: string | null;
  avatarUrl: string | null;
  archived: boolean;
  lastMessage: { body: string; at: string; authorName: string } | null;
  unread: boolean;
  /** Number of messages newer than the caller's last read; rendered as 9+ when above nine. */
  unreadCount: number;
}

/** Kept as an alias so existing imports keep working. */
export type TeamChannelSummary = ConversationCard;

export interface ConversationsPayload {
  directs: ConversationCard[];
  teams: ConversationCard[];
}

export interface ChannelSummary {
  _id: string;
  name: string;
  avatarUrl: string | null;
  archived: boolean;
}

/** One row of the channel member panel: who they are, their workspace role and whether they are here. */
export interface ChannelMember {
  _id: string;
  name: string;
  avatarUrl: string;
  roleName: string;
  online: boolean;
}

export interface ChannelMembersPayload {
  members: ChannelMember[];
  count: number;
}

/** Who is connected, by user id. */
export type PresenceMap = Record<string, boolean>;

export const authorOf = (message: ChatMessage): ChatUser | null =>
  typeof message.author === 'string' ? null : message.author;

export const authorName = (message: ChatMessage): string => authorOf(message)?.name ?? 'Someone';
