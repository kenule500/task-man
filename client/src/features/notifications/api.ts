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
