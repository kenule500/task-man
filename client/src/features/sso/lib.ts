import type { StoredUser } from '@/utils/session';
import type { SsoProviderId } from './types';

export const SSO_PROVIDER_IDS: readonly SsoProviderId[] = ['google', 'microsoft'];

export const isSsoProviderId = (value: unknown): value is SsoProviderId =>
  typeof value === 'string' && (SSO_PROVIDER_IDS as readonly string[]).includes(value);

/** Plain-language text for the fixed `sso_error` codes the server redirects with. */
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Sign-in was cancelled. You can try again or use your email and password.',
  invalid_state: 'That sign-in link has expired or was already used. Start again from this page.',
  provider_error: 'The sign-in provider did not answer as expected. Try again in a moment.',
  invalid_token: 'The response from the provider could not be verified, so you were not signed in. Try again.',
  email_missing: 'The provider did not share an email address, so we could not match your account.',
  email_unverified: 'The provider has not verified that email address, so we cannot use it to sign you in. Verify it with the provider, or use your email and password.',
  tenant_not_allowed: 'This type of Microsoft account is not allowed here. Use a work or school account, or another sign-in method.',
  account_conflict: 'This email already belongs to an account linked to a different login at that provider. Sign in with your email and password instead.',
  server_error: 'Something went wrong on our side. Try again in a moment.',
  not_started: 'That sign-in was not started in this browser. Please start again from the sign-in page.',
};

/** Message for an `sso_error` code, or `null` when the code is missing. Unknown codes get a generic message (never echoed). */
export const ssoErrorMessage = (code: string | null | undefined): string | null => {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? 'Single sign-on did not work. Try again or use your email and password.';
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
  };
};
