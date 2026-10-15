import api from '@/utils/api';
import type { CustomField, CustomFieldInput, CustomFieldPatch } from './types';

const fieldsUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/fields`;

export const fieldsApi = {
  list: async (slug: string): Promise<CustomField[]> => {
    const { data } = await api.get(fieldsUrl(slug));
    return Array.isArray(data) ? (data as CustomField[]) : [];
  },
  create: async (slug: string, input: CustomFieldInput): Promise<CustomField> => {
    const { data } = await api.post(fieldsUrl(slug), input);
    return data as CustomField;
  },
  update: async (slug: string, id: string, patch: CustomFieldPatch): Promise<CustomField> => {
    const { data } = await api.patch(`${fieldsUrl(slug)}/${encodeURIComponent(id)}`, patch);
    return data as CustomField;
  },
  remove: async (slug: string, id: string): Promise<void> => {
    await api.delete(`${fieldsUrl(slug)}/${encodeURIComponent(id)}`);
  },
  /** The listed ids come first, in that order. Returns the fields in the new order. */
  reorder: async (slug: string, ids: string[]): Promise<CustomField[]> => {
    const { data } = await api.put(`${fieldsUrl(slug)}/order`, { ids });
    return Array.isArray(data) ? (data as CustomField[]) : [];
  },
};
