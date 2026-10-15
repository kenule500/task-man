import api from '@/utils/api';
import type { AccountSession, TwoFactorSetup, TwoFactorStatus } from './types';

export const sessionsApi = {
  list: async (): Promise<AccountSession[]> => {
    const { data } = await api.get('/profile/sessions');
    return Array.isArray(data) ? data : [];
  },
  revoke: async (id: string): Promise<void> => {
    await api.delete(`/profile/sessions/${encodeURIComponent(id)}`);
  },
  revokeOthers: async (): Promise<number> => {
    const { data } = await api.post('/profile/sessions/revoke-others');
    return typeof data?.revoked === 'number' ? data.revoked : 0;
  },
};

export const twoFactorApi = {
  status: async (): Promise<TwoFactorStatus> => {
    const { data } = await api.get('/profile/2fa');
    return {
      enabled: Boolean(data?.enabled),
      enabledAt: data?.enabledAt ?? null,
      recoveryCodesRemaining: Number(data?.recoveryCodesRemaining) || 0,
    };
  },
  setup: async (): Promise<TwoFactorSetup> => {
    const { data } = await api.post('/profile/2fa/setup');
    return { secret: data.secret, otpauthUrl: data.otpauthUrl };
  },
  /** Returns the recovery codes, shown once. */
  enable: async (input: { code: string; password: string }): Promise<string[]> => {
    const { data } = await api.post('/profile/2fa/enable', input);
    return Array.isArray(data?.recoveryCodes) ? data.recoveryCodes : [];
  },
  disable: async (input: { password: string; code?: string; recoveryCode?: string }): Promise<void> => {
    await api.post('/profile/2fa/disable', input);
  },
  regenerateRecoveryCodes: async (input: { password: string; code: string }): Promise<string[]> => {
    const { data } = await api.post('/profile/2fa/recovery-codes', input);
    return Array.isArray(data?.recoveryCodes) ? data.recoveryCodes : [];
  },
};
