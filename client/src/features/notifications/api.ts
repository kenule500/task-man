import api from '@/utils/api';
import type { NotificationPage } from './types';

export interface ListNotificationsParams {
  unread?: boolean;
  limit?: number;
  before?: string | null;
}

export const notificationsApi = {
  list: async ({ unread, limit, before }: ListNotificationsParams = {}): Promise<NotificationPage> => {
    const { data } = await api.get('/notifications', {
      params: {
        ...(unread ? { unread: 1 } : {}),
        ...(limit ? { limit } : {}),
        ...(before ? { before } : {}),
      },
    });
    return { items: [], nextBefore: null, unreadCount: 0, ...data };
  },
  markRead: async (id: string): Promise<{ unreadCount: number }> => {
    const { data } = await api.post(`/notifications/${encodeURIComponent(id)}/read`);
    return data;
  },
  markAllRead: async (): Promise<{ unreadCount: number }> => {
    const { data } = await api.post('/notifications/read-all');
    return data;
  },
};

export interface PushConfig {
  publicKey: string | null;
  enabled: boolean;
}

export const pushApi = {
  config: async (): Promise<PushConfig> => {
    const { data } = await api.get('/notifications/push/public-key');
    return { publicKey: data?.publicKey ?? null, enabled: Boolean(data?.enabled && data?.publicKey) };
  },
  subscribe: async (subscription: PushSubscriptionJSON): Promise<void> => {
    await api.post('/notifications/push/subscribe', subscription);
  },
  unsubscribe: async (endpoint: string): Promise<void> => {
    await api.post('/notifications/push/unsubscribe', { endpoint });
  },
};
