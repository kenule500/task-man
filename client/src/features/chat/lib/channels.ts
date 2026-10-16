import type { ChatActivity, ChatChannel, ChatUser } from '../types';

export interface ChannelGroups {
  team: ChatChannel[];
  projects: ChatChannel[];
  direct: ChatChannel[];
}

const byRecent = (a: ChatChannel, b: ChatChannel): number =>
  (b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0) - (a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0);

/** Sidebar sections: #general first, then team channels by name; projects by name; direct messages by recent activity. */
export const groupChannels = (channels: ChatChannel[]): ChannelGroups => ({
  team: channels
    .filter(channel => channel.type === 'team')
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)),
  projects: channels.filter(channel => channel.type === 'project').sort((a, b) => a.name.localeCompare(b.name)),
  direct: channels.filter(channel => channel.type === 'dm').sort(byRecent),
});

/** The other person in a direct message. */
export const dmPartner = (channel: ChatChannel, selfId: string): ChatUser | null =>
  channel.members.find(member => member._id !== selfId) ?? null;

export const sumUnread = (channels: ChatChannel[]): number => channels.reduce((sum, channel) => sum + channel.unread, 0);

export const upsertChannel = (channels: ChatChannel[], channel: ChatChannel): ChatChannel[] => {
  const index = channels.findIndex(existing => existing._id === channel._id);
  if (index === -1) return [...channels, channel];
  // A pushed channel carries no counts of its own: keep what this client already knows
  const next = [...channels];
  next[index] = { ...channel, unread: next[index].unread, lastMessage: next[index].lastMessage ?? channel.lastMessage };
  return next;
};

export const removeChannel = (channels: ChatChannel[], id: string): ChatChannel[] =>
  channels.some(channel => channel._id === id) ? channels.filter(channel => channel._id !== id) : channels;

export const clearUnread = (channels: ChatChannel[], id: string): ChatChannel[] =>
  channels.map(channel => (channel._id === id && channel.unread > 0 ? { ...channel, unread: 0 } : channel));

/**
 * Folds a "message posted" notice into the list: the preview and time update, and the unread count goes up
 * unless the person wrote it or is looking at that channel. `known: false` means the channel is new to this
 * client (created while it was offline), so the caller should reload the list.
 */
export const applyActivity = (
  channels: ChatChannel[],
  activity: ChatActivity,
  context: { selfId: string; activeId: string | null },
): { channels: ChatChannel[]; known: boolean } => {
  const index = channels.findIndex(channel => channel._id === activity.channelId);
  if (index === -1) return { channels, known: false };
  const channel = channels[index];
  if (channel.lastMessage?._id === activity.messageId) return { channels, known: true };

  const mine = activity.authorId === context.selfId;
  const looking = context.activeId === channel._id;
  const next = [...channels];
  next[index] = {
    ...channel,
    lastMessageAt: activity.createdAt,
    lastMessage: {
      _id: activity.messageId,
      text: activity.preview,
      createdAt: activity.createdAt,
      author: { _id: activity.authorId, name: activity.authorName },
    },
    unread: mine || looking ? channel.unread : channel.unread + 1,
  };
  return { channels: next, known: true };
};

/** Whether the person may rename or archive: not #general or a direct message, and the creator or a manager. */
export const canManageChannel = (channel: ChatChannel, selfId: string, canManageWorkspace: boolean): boolean =>
  channel.type !== 'dm' && !channel.isDefault && (canManageWorkspace || channel.createdBy === selfId);
