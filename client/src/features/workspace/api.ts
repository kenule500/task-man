import api from '@/utils/api';
import type { WorkspaceDetails, WorkspaceMember } from './types';

const workspaceUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}`;

export const workspaceApi = {
  get: async (slug: string): Promise<WorkspaceDetails> => {
    const { data } = await api.get(workspaceUrl(slug));
    return data;
  },
  members: async (slug: string): Promise<WorkspaceMember[]> => {
    const { data } = await api.get(`${workspaceUrl(slug)}/members`);
    return Array.isArray(data) ? data : [];
  },
  update: async (slug: string, input: { name: string }): Promise<WorkspaceDetails> => {
    const { data } = await api.put(workspaceUrl(slug), input);
    return data;
  },
  regenerateInvite: async (slug: string): Promise<{ inviteCode: string }> => {
    const { data } = await api.post(`${workspaceUrl(slug)}/invite-code`);
    return data;
  },
};
