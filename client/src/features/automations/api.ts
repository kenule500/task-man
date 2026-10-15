import api from '@/utils/api';
import type { Automation, AutomationInput, AutomationTemplate } from './types';

const automationsUrl = (slug: string, suffix = '') =>
  `/workspaces/${encodeURIComponent(slug)}/automations${suffix}`;

export const automationsApi = {
  list: async (slug: string): Promise<Automation[]> => {
    const { data } = await api.get(automationsUrl(slug));
    return Array.isArray(data) ? data : [];
  },
  templates: async (slug: string): Promise<AutomationTemplate[]> => {
    const { data } = await api.get(automationsUrl(slug, '/templates'));
    return Array.isArray(data) ? data : [];
  },
  create: async (slug: string, input: AutomationInput): Promise<Automation> => {
    const { data } = await api.post(automationsUrl(slug), input);
    return data;
  },
  update: async (slug: string, id: string, patch: Partial<AutomationInput>): Promise<Automation> => {
    const { data } = await api.patch(automationsUrl(slug, `/${encodeURIComponent(id)}`), patch);
    return data;
  },
  remove: async (slug: string, id: string): Promise<void> => {
    await api.delete(automationsUrl(slug, `/${encodeURIComponent(id)}`));
  },
};
