// Single sign-on providers (OpenID Connect), configured from the environment.
// A provider is enabled only when both its client id and its client secret are set.

export type SsoProviderId = 'google' | 'microsoft';

export const SSO_PROVIDER_IDS: readonly SsoProviderId[] = ['google', 'microsoft'];

export interface SsoProviderConfig {
  id: SsoProviderId;
  label: string;
  clientId: string;
  clientSecret: string;
  /** OpenID Connect discovery document */
  discoveryUrl: string;
  /** Issuers accepted besides the one in the discovery document (Google also signs with the bare host) */
  alternateIssuers: string[];
  /** Microsoft only: `common`, `organizations`, `consumers`, a tenant id or a verified domain */
  tenant?: string;
}

export const isSsoProviderId = (value: unknown): value is SsoProviderId =>
  typeof value === 'string' && (SSO_PROVIDER_IDS as readonly string[]).includes(value);

/** Tenant values that accept accounts from many directories (the issuer then names the signer's own tenant). */
export const MULTI_TENANT_VALUES = ['common', 'organizations', 'consumers'] as const;

const clean = (value: string | undefined): string => (value ?? '').trim();

/** Enabled providers, in display order. Pure: pass any environment object. */
export const readSsoProviders = (source: NodeJS.ProcessEnv): SsoProviderConfig[] => {
  const providers: SsoProviderConfig[] = [];

  const googleId = clean(source.GOOGLE_CLIENT_ID);
  const googleSecret = clean(source.GOOGLE_CLIENT_SECRET);
  if (googleId && googleSecret) {
    providers.push({
      id: 'google',
      label: 'Google',
      clientId: googleId,
      clientSecret: googleSecret,
      discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
      alternateIssuers: ['accounts.google.com'],
    });
  }

  const microsoftId = clean(source.MICROSOFT_CLIENT_ID);
  const microsoftSecret = clean(source.MICROSOFT_CLIENT_SECRET);
  if (microsoftId && microsoftSecret) {
    // The tenant ends up in a URL path: only the characters a tenant id or domain can have
    const requested = clean(source.MICROSOFT_TENANT).toLowerCase();
    const tenant = /^[a-z0-9.-]{1,100}$/.test(requested) ? requested : 'common';
    providers.push({
      id: 'microsoft',
      label: 'Microsoft',
      clientId: microsoftId,
      clientSecret: microsoftSecret,
      discoveryUrl: `https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`,
      alternateIssuers: [],
      tenant,
    });
  }

  return providers;
};

export const getSsoProviders = (): SsoProviderConfig[] => readSsoProviders(process.env);

export const getSsoProvider = (id: unknown): SsoProviderConfig | null =>
  isSsoProviderId(id) ? getSsoProviders().find(provider => provider.id === id) ?? null : null;

/**
 * Base URL of the API as the browser and the identity provider see it (no trailing slash).
 * Defaults to `<CLIENT_URL>/api`, which is right when the API and the app share an origin (Vercel);
 * set `API_PUBLIC_URL` when they do not (for example `http://localhost:5000/api` in development).
 */
export const getApiPublicUrl = (clientUrl: string): string =>
  (clean(process.env.API_PUBLIC_URL) || `${clientUrl}/api`).replace(/\/+$/, '');

export const callbackUrl = (clientUrl: string, provider: SsoProviderId): string =>
  `${getApiPublicUrl(clientUrl)}/auth/sso/${provider}/callback`;
