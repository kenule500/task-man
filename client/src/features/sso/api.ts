import api from '@/utils/api';
import { API_URL } from '@/config';
import { isSsoProviderId } from './lib';
import type { SsoMethod, SsoMethodsState, SsoProvider, SsoProviderId } from './types';

export const ssoApi = {
  providers: async (): Promise<SsoProvider[]> => {
    const { data } = await api.get('/auth/sso/providers');
    const list: unknown[] = Array.isArray(data?.providers) ? data.providers : [];
    return list.flatMap((item) => {
      const provider = item as Partial<SsoProvider>;
      return isSsoProviderId(provider.id) ? [{ id: provider.id, label: String(provider.label ?? provider.id) }] : [];
    });
  },
  methods: async (): Promise<SsoMethodsState> => {
    const { data } = await api.get('/profile/sso');
    const methods: SsoMethod[] = (Array.isArray(data?.methods) ? data.methods : [])
      .filter((method: Partial<SsoMethod>) => isSsoProviderId(method.provider))
      .map((method: SsoMethod) => ({ provider: method.provider, email: method.email ?? null, linkedAt: method.linkedAt ?? null }));
    const available: SsoProviderId[] = (Array.isArray(data?.available) ? data.available : []).filter(isSsoProviderId);
    return { methods, hasPassword: data?.hasPassword !== false, available };
  },
  unlink: async (provider: SsoProviderId): Promise<void> => {
    await api.delete(`/profile/sso/${provider}`);
  },
};

/** Address that starts the provider sign-in. It is a full-page navigation, not an XHR. */
export const ssoStartUrl = (provider: SsoProviderId, redirect?: string): string => {
  const base = `${API_URL.replace(/\/+$/, '')}/auth/sso/${provider}/start`;
  return redirect ? `${base}?redirect=${encodeURIComponent(redirect)}` : base;
};
