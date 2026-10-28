import api from '@/utils/api';
import type {
  ChannelMembersPayload, ChannelSummary, ChatChannel, ChatMessage, ChatUser, ConversationsPayload,
  ConversationCard, MessagePage, OutgoingMessage, Reaction, SearchPage,
} from './types';

const base = (slug: string) => `/workspaces/${encodeURIComponent(slug)}`;
const channelBase = (slug: string, channelId: string) =>
  `${base(slug)}/chat/${encodeURIComponent(channelId)}`;

export const chatApi = {
  channels: async (slug: string): Promise<ChatChannel[]> => {
    const { data } = await api.get(`${base(slug)}/channels`);
    return Array.isArray(data) ? data : [];
  },

  members: async (slug: string): Promise<ChatUser[]> => {
    const { data } = await api.get(`${base(slug)}/chat/members`);
    return Array.isArray(data?.members) ? data.members : [];
  },

  messages: async (slug: string, channelId: string, before?: string | null): Promise<MessagePage> => {
    const { data } = await api.get(`${channelBase(slug, channelId)}/messages`, {
      params: before ? { before } : undefined,
    });
    return {
      messages: Array.isArray(data?.messages) ? data.messages : [],
      nextCursor: data?.nextCursor ?? null,
    };
  },

  send: async (slug: string, input: OutgoingMessage): Promise<ChatMessage> => {
    const { data } = await api.post(`${channelBase(slug, input.channelId)}/messages`, {
      body: input.body,
      parentId: input.parentId ?? null,
      mentionIds: input.mentionIds ?? [],
      attachmentIds: input.attachmentIds ?? [],
    });
    return data;
  },

  replies: async (slug: string, channelId: string, messageId: string): Promise<ChatMessage[]> => {
    const { data } = await api.get(`${channelBase(slug, channelId)}/messages/${messageId}/replies`);
    return Array.isArray(data?.replies) ? data.replies : [];
  },

  edit: async (slug: string, channelId: string, messageId: string, body: string): Promise<ChatMessage> => {
    const { data } = await api.patch(`${channelBase(slug, channelId)}/messages/${messageId}`, { body });
    return data;
  },

  remove: async (slug: string, channelId: string, messageId: string): Promise<ChatMessage> => {
    const { data } = await api.delete(`${channelBase(slug, channelId)}/messages/${messageId}`);
    return data;
  },

  react: async (slug: string, channelId: string, messageId: string, emoji: string): Promise<Reaction[]> => {
    const { data } = await api.post(`${channelBase(slug, channelId)}/messages/${messageId}/reactions`, { emoji });
    return Array.isArray(data?.reactions) ? data.reactions : [];
  },

  pin: async (slug: string, channelId: string, messageId: string): Promise<ChatMessage> => {
    const { data } = await api.post(`${channelBase(slug, channelId)}/messages/${messageId}/pin`);
    return data;
  },

  unpin: async (slug: string, channelId: string, messageId: string): Promise<ChatMessage> => {
    const { data } = await api.delete(`${channelBase(slug, channelId)}/messages/${messageId}/pin`);
    return data;
  },

  pinned: async (slug: string, channelId: string): Promise<ChatMessage[]> => {
    const { data } = await api.get(`${channelBase(slug, channelId)}/pins`);
    return Array.isArray(data?.pinned) ? data.pinned : [];
  },

  search: async (
    slug: string,
    channelId: string,
    term: string,
    cursor?: string | null,
  ): Promise<SearchPage> => {
    const params: Record<string, string> = { q: term };
    // The endpoint has always accepted `before`; sending it lets the find widget page through matches
    if (cursor) params.before = cursor;
    const { data } = await api.get(`${channelBase(slug, channelId)}/search`, { params });
    return {
      results: Array.isArray(data?.results) ? data.results : [],
      nextCursor: data?.nextCursor ?? null,
    };
  },

  markRead: async (slug: string, channelId: string, messageId?: string | null): Promise<void> => {
    await api.post(`${channelBase(slug, channelId)}/read`, { messageId: messageId ?? null });
  },

  startDirect: async (slug: string, userId: string): Promise<ChatChannel> => {
    const { data } = await api.post(`${base(slug)}/chat/direct`, { userId });
    return data;
  },

  /** Direct messages and team channels in one request, so the side panel loads in one round trip. */
  conversations: async (slug: string): Promise<ConversationsPayload> => {
    const { data } = await api.get(`${base(slug)}/chat/conversations`);
    return {
      directs: Array.isArray(data?.directs) ? data.directs : [],
      teams: Array.isArray(data?.teams) ? data.teams : [],
    };
  },

  /** Team channels the caller may read, with previews and unread state. */
  teams: async (slug: string): Promise<ConversationCard[]> => {
    const { data } = await api.get(`${base(slug)}/chat/teams`);
    return Array.isArray(data?.teams) ? data.teams : [];
  },

  /**
   * One project's channel, created on demand. Resolving before navigating keeps a channel-less
   * project from landing the member on an empty route (FR-090, AC-093).
   */
  projectChannel: async (slug: string, projectId: string): Promise<ChannelSummary> => {
    const { data } = await api.get(
      `${base(slug)}/chat/projects/${encodeURIComponent(projectId)}/channel`,
    );
    return data;
  },

  /** Everyone in one channel, with workspace role and presence (FR-094). */
  channelMembers: async (slug: string, channelId: string): Promise<ChannelMembersPayload> => {
    const { data } = await api.get(`${channelBase(slug, channelId)}/members`);
    return {
      members: Array.isArray(data?.members) ? data.members : [],
      count: typeof data?.count === 'number' ? data.count : (data?.members?.length ?? 0),
    };
  },

  renameChannel: async (slug: string, channelId: string, name: string): Promise<ChannelSummary> => {
    const { data } = await api.patch(`${base(slug)}/chat/${encodeURIComponent(channelId)}`, { name });
    return data;
  },

  uploadAvatar: async (slug: string, channelId: string, file: File): Promise<ChannelSummary> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post(
      `${base(slug)}/chat/${encodeURIComponent(channelId)}/avatar`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },
};
