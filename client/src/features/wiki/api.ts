import axios from 'axios';
import api from '@/utils/api';
import type {
  WikiCreateInput, WikiMovePlan, WikiPage, WikiPageSummary, WikiPatch, WikiSaveResult, WikiSearchHit, WikiVersion,
  WikiVersionList,
} from './types';

const pagesUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/pages`;
const pageUrl = (slug: string, id: string) => `${pagesUrl(slug)}/${encodeURIComponent(id)}`;

const asPage = (data: unknown): WikiPage => {
  const page = data as WikiPage;
  return { ...page, content: page.content ?? '', mentions: Array.isArray(page.mentions) ? page.mentions : [] };
};

export const wikiApi = {
  /** Page tree (titles only) of the workspace wiki, or of one project's wiki. */
  list: async (slug: string, project = ''): Promise<WikiPageSummary[]> => {
    const { data } = await api.get(pagesUrl(slug), { params: project ? { project } : undefined });
    return Array.isArray(data) ? data : [];
  },
  search: async (slug: string, q: string, project?: string): Promise<WikiSearchHit[]> => {
    const { data } = await api.get(`${pagesUrl(slug)}/search`, { params: { q, ...(project ? { project } : {}) } });
    return Array.isArray(data) ? data : [];
  },
  get: async (slug: string, id: string): Promise<WikiPage> => {
    const { data } = await api.get(pageUrl(slug, id));
    return asPage(data);
  },
  create: async (slug: string, input: WikiCreateInput): Promise<WikiPage> => {
    const { data } = await api.post(pagesUrl(slug), input);
    return asPage(data);
  },
  /** Saves on top of `version`; a stale version comes back as a conflict carrying the latest page. */
  update: async (slug: string, id: string, version: number, patch: WikiPatch): Promise<WikiSaveResult> => {
    try {
      const { data } = await api.patch(pageUrl(slug, id), { version, ...patch });
      return { kind: 'saved', page: asPage(data) };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409 && error.response.data?.page) {
        return { kind: 'conflict', page: asPage(error.response.data.page) };
      }
      throw error;
    }
  },
  remove: async (slug: string, id: string): Promise<void> => {
    await api.delete(pageUrl(slug, id));
  },
  /** Moves a page; answers with the whole tree of that wiki. */
  move: async (slug: string, id: string, plan: WikiMovePlan): Promise<WikiPageSummary[]> => {
    const { data } = await api.post(`${pageUrl(slug, id)}/move`, plan);
    return Array.isArray(data) ? data : [];
  },
  versions: async (slug: string, id: string): Promise<WikiVersionList> => {
    const { data } = await api.get(`${pageUrl(slug, id)}/versions`);
    return { current: Number(data?.current) || 1, versions: Array.isArray(data?.versions) ? data.versions : [] };
  },
  version: async (slug: string, id: string, version: number): Promise<WikiVersion> => {
    const { data } = await api.get(`${pageUrl(slug, id)}/versions/${version}`);
    return data;
  },
  restore: async (slug: string, id: string, version: number): Promise<WikiPage> => {
    const { data } = await api.post(`${pageUrl(slug, id)}/restore/${version}`);
    return asPage(data);
  },
};
