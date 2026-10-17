import type { ChatChannel, ChatMessage } from '../types';

/** Team first, then general, then project channels, then direct conversations (matches the API order). */
const KIND_ORDER: Record<ChatChannel['kind'], number> = {
  team: 0, general: 1, project: 2, direct: 3,
};

export const sortChannels = (channels: ChatChannel[]): ChatChannel[] =>
  [...channels].sort((a, b) =>
    (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.name.localeCompare(b.name));

/** Channels a member may be looking at: archived project channels stay readable but leave the list. */
export const activeChannels = (channels: ChatChannel[]): ChatChannel[] =>
  channels.filter(channel => !channel.archived);

/** The channel to open when the route names none: the first one the member can read. */
export const defaultChannelId = (channels: ChatChannel[]): string | null =>
  sortChannels(activeChannels(channels))[0]?._id ?? null;

export interface DayGroup {
  key: string;
  label: string;
  messages: ChatMessage[];
}

const dayKey = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso.slice(0, 10) : date.toISOString().slice(0, 10);
};

const dayLabel = (key: string, now: Date): string => {
  const today = now.toISOString().slice(0, 10);
  if (key === today) return 'Today';
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (key === yesterday) return 'Yesterday';
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? key
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Groups a channel's messages by calendar day, keeping the order they arrive in
 * (the list is rendered oldest first, so replies read naturally).
 */
export const groupByDay = (messages: ChatMessage[], now: Date = new Date()): DayGroup[] => {
  const groups: DayGroup[] = [];
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.messages.push(message);
    } else {
      groups.push({ key, label: dayLabel(key, now), messages: [message] });
    }
  }
  return groups;
};

/**
 * Merges a page of older messages in front of what is already loaded, dropping duplicates.
 * Paging may overlap when messages arrive while the user scrolls, so duplicates are expected.
 */
export const prependOlder = (current: ChatMessage[], older: ChatMessage[]): ChatMessage[] => {
  const seen = new Set(current.map(message => message._id));
  const unique = older.filter(message => !seen.has(message._id));
  return [...unique, ...current];
};

/** Applies a live message: replaces a known one in place, otherwise appends it at the end. */
export const upsertMessage = (current: ChatMessage[], incoming: ChatMessage): ChatMessage[] => {
  const index = current.findIndex(message => message._id === incoming._id);
  if (index === -1) return [...current, incoming];
  const next = [...current];
  next[index] = incoming;
  return next;
};

/**
 * How many channels have messages newer than the reader's last visit.
 * A channel never opened counts as unread once it has a message.
 */
export const unreadCount = (
  channel: ChatChannel,
  lastReadAtByChannel: Record<string, string | undefined>,
): number => {
  if (!channel.lastMessageAt) return 0;
  const seen = lastReadAtByChannel[channel._id];
  if (!seen) return 1;
  return new Date(channel.lastMessageAt).getTime() > new Date(seen).getTime() ? 1 : 0;
};

/** Human label for a direct conversation, which the API stores without a per-person name. */
export const channelLabel = (
  channel: ChatChannel,
  currentUserId: string | undefined,
  nameOf: (userId: string) => string,
): string => {
  if (channel.kind !== 'direct') return channel.name;
  const other = channel.participants.find(id => id !== currentUserId);
  return other ? nameOf(other) : channel.name;
};
