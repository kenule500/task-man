// Single place that knows how the logged-in session is stored in the browser.

export interface StoredUser {
  _id: string;
  name: string;
  email: string;
  onboardingComplete?: boolean;
  activeWorkspace?: string;
  activeWorkspaceSlug?: string;
  workspaces?: string[];
  createdAt?: string;
}

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const getStoredUser = (): StoredUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
};

export const saveSession = (token: string, user: StoredUser): void => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

/** Merges fields into the stored user (e.g. after onboarding or a workspace switch). */
export const updateStoredUser = (patch: Partial<StoredUser>): StoredUser | null => {
  const current = getStoredUser();
  if (!current) return null;
  const next = { ...current, ...patch };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  return next;
};

export const clearSession = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};
