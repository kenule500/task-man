import api from '@/utils/api';
import type { AuditFilters, AuditPage } from './types';

const auditUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/activity`;

const filterParams = (filters: AuditFilters) => ({
  ...(filters.area ? { area: filters.area } : {}),
  ...(filters.actor ? { actor: filters.actor } : {}),
});

export const auditApi = {
  list: async (slug: string, filters: AuditFilters, before?: string, limit = 50): Promise<AuditPage> => {
    const { data } = await api.get(auditUrl(slug), { params: { ...filterParams(filters), ...(before ? { before } : {}), limit } });
    return { items: [], nextBefore: null, retentionDays: 365, areas: [], ...data };
  },
  /** CSV of the entries matching the filters (the server records the export in the log). */
  exportCsv: async (slug: string, filters: AuditFilters): Promise<Blob> => {
    const { data } = await api.get(auditUrl(slug), { params: { ...filterParams(filters), format: 'csv' }, responseType: 'blob' });
    return data as Blob;
  },
};

/** Saves a Blob through a temporary link so the Authorization header of the request is not needed again. */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
