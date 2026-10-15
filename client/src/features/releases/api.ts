import api from '@/utils/api';
import type { MoveOpenTo, Release, ReleaseDetail, ReleaseInput, ReleaseNotes, ReleasePatch } from './types';

const releasesUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/releases`;
const releaseUrl = (slug: string, id: string) => `${releasesUrl(slug)}/${encodeURIComponent(id)}`;

export const releasesApi = {
  list: async (slug: string, projectId?: string): Promise<Release[]> => {
    const { data } = await api.get(releasesUrl(slug), { params: projectId ? { project: projectId } : undefined });
    return Array.isArray(data) ? data : [];
  },
  get: async (slug: string, id: string): Promise<ReleaseDetail> => {
    const { data } = await api.get(releaseUrl(slug, id));
    return data;
  },
  notes: async (slug: string, id: string): Promise<ReleaseNotes> => {
    const { data } = await api.get(`${releaseUrl(slug, id)}/notes`);
    return { markdown: typeof data?.markdown === 'string' ? data.markdown : '', groups: Array.isArray(data?.groups) ? data.groups : [] };
  },
  create: async (slug: string, input: ReleaseInput): Promise<Release> => {
    const { data } = await api.post(releasesUrl(slug), input);
    return data;
  },
  update: async (slug: string, id: string, patch: ReleasePatch): Promise<Release> => {
    const { data } = await api.patch(releaseUrl(slug, id), patch);
    return data;
  },
  remove: async (slug: string, id: string): Promise<void> => {
    await api.delete(releaseUrl(slug, id));
  },
  release: async (slug: string, id: string, moveOpenTo?: MoveOpenTo): Promise<{ release: Release; movedTasks: number }> => {
    const { data } = await api.post(`${releaseUrl(slug, id)}/release`, moveOpenTo === undefined ? {} : { moveOpenTo });
    return data;
  },
};
