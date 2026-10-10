// Light / dark / system theme. The `dark` class on <html> switches the variables in index.css.
// The preference ('light' | 'dark' | 'system') is stored per browser in localStorage (so the first paint is right
// before any request) and per account on the user profile (PUT /api/profile, field `theme`).
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'taskman.theme';
export const THEME_OPTIONS: readonly ThemePreference[] = ['light', 'dark', 'system'];
/** Browser UI color (address bar, PWA title bar) per resolved theme. */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#2563EB', dark: '#0B1220' };

const DARK_QUERY = '(prefers-color-scheme: dark)';

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

/** 'system' follows the OS; an explicit choice always wins. */
export const resolveTheme = (preference: ThemePreference, systemDark: boolean): ResolvedTheme =>
  preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

const systemQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;

export const getSystemDark = (): boolean => systemQuery()?.matches ?? false;

export const getStoredTheme = (): ThemePreference => {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
};

/** Puts the resolved theme on the document: `dark` class, native color-scheme and the browser theme color. */
export const applyTheme = (theme: ResolvedTheme): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute('content', THEME_COLORS[theme]));
};

// ---- Preference store (also what useThemePreference reads) ----

let preference: ThemePreference = 'system';
let resolved: ResolvedTheme = 'light';
let detachSystem: (() => void) | null = null;
const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach(listener => listener());

const refresh = (): void => {
  resolved = resolveTheme(preference, getSystemDark());
  applyTheme(resolved);
  notify();
};

/** Follows the OS setting only while the preference is 'system'. */
const watchSystem = (): void => {
  detachSystem?.();
  detachSystem = null;
  const query = systemQuery();
  if (preference !== 'system' || !query) return;
  const onChange = (): void => refresh();
  query.addEventListener('change', onChange);
  detachSystem = () => query.removeEventListener('change', onChange);
};

/** Sets the preference for this browser: applies it now, stores it, and tracks the OS when 'system'. */
export const setThemePreference = (next: ThemePreference): void => {
  preference = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Private mode or storage disabled: the theme still applies for this page view
  }
  watchSystem();
  refresh();
};

/** Call once before the first render: applies the stored preference so there is no flash of the wrong theme. */
export const initTheme = (): void => {
  preference = getStoredTheme();
  watchSystem();
  refresh();
  // Another tab changed the theme
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', event => {
      if (event.key !== THEME_STORAGE_KEY) return;
      preference = getStoredTheme();
      watchSystem();
      refresh();
    });
  }
};

/**
 * Adopts the account's saved preference (`user.theme` from GET/PUT /api/profile). Call it after sign-in and when
 * the session loads, so the choice follows the person to another browser. Ignores users without a valid theme.
 */
export const syncThemeFromUser = (user: { theme?: unknown } | null | undefined): void => {
  if (user && isThemePreference(user.theme) && user.theme !== preference) setThemePreference(user.theme);
};

export const getThemePreference = (): ThemePreference => preference;
export const getResolvedTheme = (): ResolvedTheme => resolved;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** React hook: the current preference, the theme it resolves to, and the setter. */
export const useThemePreference = (): { preference: ThemePreference; resolved: ResolvedTheme; setPreference: (next: ThemePreference) => void } => {
  const current = useSyncExternalStore(subscribe, getThemePreference, getThemePreference);
  const currentResolved = useSyncExternalStore(subscribe, getResolvedTheme, getResolvedTheme);
  return { preference: current, resolved: currentResolved, setPreference: setThemePreference };
};
