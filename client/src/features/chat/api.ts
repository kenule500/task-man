import api from '@/utils/api';
import type {
  ChatChannel, ChatMessage, ChatUser, MessagePage, OutgoingMessage, Reaction, SearchPage,
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

  search: async (slug: string, channelId: string, term: string): Promise<SearchPage> => {
    const { data } = await api.get(`${channelBase(slug, channelId)}/search`, { params: { q: term } });
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
};
