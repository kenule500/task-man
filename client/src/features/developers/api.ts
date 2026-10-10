import api from '@/utils/api';
import type {
  ApiToken, ApiTokenInput, CreatedApiToken, Webhook, WebhookDelivery, WebhookInput, WebhookWithSecret,
} from './types';

const tokensUrl = (slug: string, suffix = '') => `/workspaces/${encodeURIComponent(slug)}/tokens${suffix}`;
const hooksUrl = (slug: string, suffix = '') => `/workspaces/${encodeURIComponent(slug)}/webhooks${suffix}`;
const part = (value: string) => encodeURIComponent(value);

export const tokensApi = {
  list: async (slug: string): Promise<ApiToken[]> => {
    const { data } = await api.get(tokensUrl(slug));
    return Array.isArray(data) ? data : [];
  },
  create: async (slug: string, input: ApiTokenInput): Promise<CreatedApiToken> => {
    const { data } = await api.post(tokensUrl(slug), input);
    return data;
  },
  revoke: async (slug: string, id: string): Promise<void> => {
    await api.delete(tokensUrl(slug, `/${part(id)}`));
  },
};

export const webhooksApi = {
  list: async (slug: string): Promise<Webhook[]> => {
    const { data } = await api.get(hooksUrl(slug));
    return Array.isArray(data) ? data : [];
  },
  create: async (slug: string, input: WebhookInput): Promise<WebhookWithSecret> => {
    const { data } = await api.post(hooksUrl(slug), input);
    return data;
  },
  update: async (slug: string, id: string, patch: Partial<WebhookInput> & { active?: boolean }): Promise<Webhook> => {
    const { data } = await api.patch(hooksUrl(slug, `/${part(id)}`), patch);
    return data;
  },
  remove: async (slug: string, id: string): Promise<void> => {
    await api.delete(hooksUrl(slug, `/${part(id)}`));
  },
  rotateSecret: async (slug: string, id: string): Promise<WebhookWithSecret> => {
    const { data } = await api.post(hooksUrl(slug, `/${part(id)}/rotate-secret`));
    return data;
  },
  test: async (slug: string, id: string): Promise<WebhookDelivery> => {
    const { data } = await api.post(hooksUrl(slug, `/${part(id)}/test`));
    return data;
  },
  deliveries: async (slug: string, id: string): Promise<WebhookDelivery[]> => {
    const { data } = await api.get(hooksUrl(slug, `/${part(id)}/deliveries`));
    return Array.isArray(data) ? data : [];
  },
  redeliver: async (slug: string, id: string, deliveryId: string): Promise<WebhookDelivery> => {
    const { data } = await api.post(hooksUrl(slug, `/${part(id)}/deliveries/${part(deliveryId)}/redeliver`));
    return data;
  },
};
