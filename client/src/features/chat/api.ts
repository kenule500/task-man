import api from '@/utils/api';
import type { ChannelList, ChatChannel, ChatMember, ChatMessage, MessagePage } from './types';

const chatUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/chat`;

export interface HistoryQuery {
  before?: string;
  after?: string;
  limit?: number;
  changedSince?: string;
}

export interface NewChannelInput {
  name?: string;
  type?: 'team' | 'project';
  project?: string;
  private?: boolean;
  members?: string[];
}

export const chatApi = {
  channels: async (slug: string): Promise<ChannelList> => {
    const { data } = await api.get(`${chatUrl(slug)}/channels`);
    return { channels: Array.isArray(data?.channels) ? data.channels : [], unreadTotal: Number(data?.unreadTotal) || 0 };
  },
  createChannel: async (slug: string, input: NewChannelInput): Promise<ChatChannel> => {
    const { data } = await api.post(`${chatUrl(slug)}/channels`, input);
    return data;
  },
  updateChannel: async (slug: string, id: string, input: { name?: string; members?: string[] }): Promise<ChatChannel> => {
    const { data } = await api.patch(`${chatUrl(slug)}/channels/${id}`, input);
    return data;
  },
  archiveChannel: async (slug: string, id: string): Promise<void> => {
    await api.delete(`${chatUrl(slug)}/channels/${id}`);
  },
  openDm: async (slug: string, userId: string): Promise<ChatChannel> => {
    const { data } = await api.post(`${chatUrl(slug)}/dm`, { userId });
    return data;
  },
  members: async (slug: string): Promise<ChatMember[]> => {
    const { data } = await api.get(`${chatUrl(slug)}/members`);
    return Array.isArray(data?.members) ? data.members : [];
  },
  messages: async (slug: string, channelId: string, query: HistoryQuery = {}): Promise<MessagePage> => {
    const { data } = await api.get(`${chatUrl(slug)}/channels/${channelId}/messages`, { params: query });
    return data;
  },
  send: async (slug: string, channelId: string, text: string): Promise<ChatMessage> => {
    const { data } = await api.post(`${chatUrl(slug)}/channels/${channelId}/messages`, { text });
    return data;
  },
  edit: async (slug: string, messageId: string, text: string): Promise<ChatMessage> => {
    const { data } = await api.patch(`${chatUrl(slug)}/messages/${messageId}`, { text });
    return data;
  },
  remove: async (slug: string, messageId: string): Promise<void> => {
    await api.delete(`${chatUrl(slug)}/messages/${messageId}`);
  },
  markRead: async (slug: string, channelId: string): Promise<void> => {
    await api.post(`${chatUrl(slug)}/channels/${channelId}/read`, {});
  },
  online: async (slug: string): Promise<string[]> => {
    const { data } = await api.get(`${chatUrl(slug)}/presence`);
    return Array.isArray(data?.online) ? data.online : [];
  },
};
