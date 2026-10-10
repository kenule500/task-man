export type SsoProviderId = 'google' | 'microsoft';

/** GET /api/auth/sso/providers */
export interface SsoProvider {
  id: SsoProviderId;
  label: string;
}

/** One linked sign-in method, GET /api/profile/sso */
export interface SsoMethod {
  provider: SsoProviderId;
  email: string | null;
  linkedAt: string | null;
}

export interface SsoMethodsState {
  methods: SsoMethod[];
  /** False for accounts created through a provider that never set a password */
  hasPassword: boolean;
  /** Providers this server offers (the card stays hidden when there is nothing to show) */
  available: SsoProviderId[];
}
