import api from '@/utils/api';
import type { CommitMapping, ImportPreview, ImportResult, ImportSource } from './types';

const importUrl = (slug: string, action: 'preview' | 'commit') => `/workspaces/${encodeURIComponent(slug)}/import/${action}`;

export const importApi = {
  preview: async (slug: string, source: ImportSource, content: string): Promise<ImportPreview> => {
    const { data } = await api.post(importUrl(slug, 'preview'), { source, content });
    return data;
  },
  commit: async (slug: string, source: ImportSource, content: string, mapping: CommitMapping): Promise<ImportResult> => {
    // A big file takes a while to write
    const { data } = await api.post(importUrl(slug, 'commit'), { source, content, mapping }, { timeout: 120_000 });
    return data;
  },
};
