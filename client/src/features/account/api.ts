import api from '@/utils/api';
import type { AccountSession } from './types';

export const sessionsApi = {
  list: async (): Promise<AccountSession[]> => {
    const { data } = await api.get('/profile/sessions');
    return Array.isArray(data) ? data : [];
  },
  revoke: async (id: string): Promise<void> => {
    await api.delete(`/profile/sessions/${encodeURIComponent(id)}`);
  },
  revokeOthers: async (): Promise<number> => {
    const { data } = await api.post('/profile/sessions/revoke-others');
    return typeof data?.revoked === 'number' ? data.revoked : 0;
  },
};
