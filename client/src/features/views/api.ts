import api from '@/utils/api';
import type { SavedView, SavedViewInput, SavedViewPatch } from './types';

const viewsUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/views`;

export const viewsApi = {
  list: async (slug: string): Promise<SavedView[]> => {
    const { data } = await api.get(viewsUrl(slug));
    return Array.isArray(data) ? data : [];
  },
  create: async (slug: string, input: SavedViewInput): Promise<SavedView> => {
    const { data } = await api.post(viewsUrl(slug), input);
    return data;
  },
  update: async (slug: string, id: string, patch: SavedViewPatch): Promise<SavedView> => {
    const { data } = await api.patch(`${viewsUrl(slug)}/${encodeURIComponent(id)}`, patch);
    return data;
  },
  remove: async (slug: string, id: string): Promise<void> => {
    await api.delete(`${viewsUrl(slug)}/${encodeURIComponent(id)}`);
  },
};
