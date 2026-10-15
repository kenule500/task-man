import api from '@/utils/api';
import type { ChangesResponse, Viewer } from './types';

const changesUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/changes`;

export const liveApi = {
  /** Without `since` the server only answers with the current cursor (the starting point). */
  changes: async (slug: string, since?: string | null): Promise<ChangesResponse> => {
    const { data } = await api.get(changesUrl(slug), { params: since ? { since } : undefined });
    return data;
  },
  heartbeat: async (slug: string, taskId: string): Promise<void> => {
    await api.post(`${changesUrl(slug)}/presence`, { taskId });
  },
  viewers: async (slug: string, taskId: string): Promise<Viewer[]> => {
    const { data } = await api.get(`${changesUrl(slug)}/presence`, { params: { task: taskId } });
    return Array.isArray(data?.viewers) ? data.viewers : [];
  },
  leave: async (slug: string, taskId: string): Promise<void> => {
    await api.delete(`${changesUrl(slug)}/presence`, { params: { task: taskId } });
  },
};
