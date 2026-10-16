import { t } from '@/i18n';
import type { StoredUser } from '@/utils/session';
import type { SsoProviderId } from './types';

export const SSO_PROVIDER_IDS: readonly SsoProviderId[] = ['google', 'microsoft'];

export const isSsoProviderId = (value: unknown): value is SsoProviderId =>
  typeof value === 'string' && (SSO_PROVIDER_IDS as readonly string[]).includes(value);

/** The fixed `sso_error` codes the server redirects with; their plain-language text is in auth:sso.errors. */
const KNOWN_ERROR_CODES = new Set([
  'access_denied', 'invalid_state', 'provider_error', 'invalid_token', 'email_missing', 'email_unverified',
  'tenant_not_allowed', 'account_conflict', 'server_error', 'not_started',
]);

/** Message for an `sso_error` code, or `null` when the code is missing. Unknown codes get a generic message (never echoed). */
export const ssoErrorMessage = (code: string | null | undefined): string | null => {
  if (!code) return null;
  return t(`auth:sso.errors.${KNOWN_ERROR_CODES.has(code) ? code : 'generic'}`);
};

/** A relative in-app path (`/x`), never an absolute or protocol-relative URL. */
export const safeAppPath = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (value.length > 300 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
};

export interface SsoFragment {
  token: string | null;
  challenge: string | null;
  redirect: string | null;
}

/** Reads `#token=...&redirect=...` / `#challenge=...` (the hand-off from the server). */
export const parseSsoFragment = (hash: string): SsoFragment => {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return {
    token: params.get('token') || null,
    challenge: params.get('challenge') || null,
    redirect: safeAppPath(params.get('redirect')),
  };
};

/** Removes the fragment from the address bar and history, so the token cannot be bookmarked, shared or re-read. */
export const clearFragment = (): void => {
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
};

// A sign-in started here is remembered for the tab, so a callback link that somebody else crafted
// (login CSRF: signing you in to *their* account) is not accepted.
const PENDING_KEY = 'ssoPending';
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

export const markSsoPending = (provider: SsoProviderId): void => {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ provider, at: Date.now() }));
  } catch {
    // Storage blocked: the hand-off will ask the person to start again
  }
};

/** True once per started sign-in. */
export const consumeSsoPending = (): boolean => {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    const pending = raw ? (JSON.parse(raw) as { at?: unknown }) : null;
    return typeof pending?.at === 'number' && Date.now() - pending.at < PENDING_MAX_AGE_MS;
  } catch {
    return false;
  }
};

interface ProfileLike {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
  createdAt?: unknown;
  language?: unknown;
  onboarding?: { completedAt?: unknown } | null;
  activeWorkspace?: unknown;
  workspaces?: unknown;
}

/** The stored session user, built from GET /api/profile (the same fields a password sign-in returns). */
export const storedUserFromProfile = (data: unknown): StoredUser => {
  const profile = (data ?? {}) as ProfileLike;
  const workspaces = Array.isArray(profile.workspaces)
    ? (profile.workspaces as { _id?: unknown; slug?: unknown }[]).filter((item) => item && typeof item === 'object')
    : [];
  const active = profile.activeWorkspace ? String(profile.activeWorkspace) : undefined;
  const activeSlug = workspaces.find((item) => String(item._id) === active)?.slug;
  return {
    _id: String(profile._id ?? ''),
    name: String(profile.name ?? ''),
    email: String(profile.email ?? ''),
    onboardingComplete: Boolean(profile.onboarding?.completedAt),
    activeWorkspace: active,
    activeWorkspaceSlug: typeof activeSlug === 'string' ? activeSlug : undefined,
    workspaces: workspaces.map((item) => String(item._id)),
    createdAt: typeof profile.createdAt === 'string' ? profile.createdAt : undefined,
    language: typeof profile.language === 'string' ? profile.language : undefined,
  };
};
