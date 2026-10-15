import {
  applyTheme, getResolvedTheme, getStoredTheme, getThemePreference, initTheme, isThemePreference, resolveTheme,
  setThemePreference, syncThemeFromUser, THEME_STORAGE_KEY,
} from '../theme';

type Listener = () => void;

/** Controllable matchMedia: `setDark(true)` fires the change listeners like an OS switch would. */
const mockSystem = (initial: boolean) => {
  let dark = initial;
  const listeners = new Set<Listener>();
  window.matchMedia = jest.fn().mockImplementation(() => ({
    get matches() { return dark; },
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  }));
  return {
    setDark: (next: boolean) => { dark = next; listeners.forEach(listener => listener()); },
    count: () => listeners.size,
  };
};

const isDark = () => document.documentElement.classList.contains('dark');

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '';
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
});

describe('resolveTheme', () => {
  it('follows the system only for the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('isThemePreference', () => {
  it('accepts only the three known values', () => {
    expect(['light', 'dark', 'system'].every(isThemePreference)).toBe(true);
    expect(isThemePreference('auto')).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});

describe('applyTheme', () => {
  it('toggles the dark class and the native color scheme', () => {
    applyTheme('dark');
    expect(isDark()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    applyTheme('light');
    expect(isDark()).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('updates the browser theme color', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#2563EB" media="(prefers-color-scheme: light)">';
    applyTheme('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0B1220');
  });
});

describe('stored preference', () => {
  it('defaults to system and ignores junk', () => {
    expect(getStoredTheme()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(getStoredTheme()).toBe('system');
  });

  it('initTheme applies the stored preference before render', () => {
    mockSystem(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    initTheme();
    expect(isDark()).toBe(true);
    expect(getResolvedTheme()).toBe('dark');
  });

  it('setThemePreference stores and applies', () => {
    mockSystem(false);
    setThemePreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(isDark()).toBe(true);
    setThemePreference('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(isDark()).toBe(false);
  });
});

describe('system changes', () => {
  it('follow the OS only while the preference is system', () => {
    const system = mockSystem(false);
    setThemePreference('system');
    expect(isDark()).toBe(false);
    system.setDark(true);
    expect(isDark()).toBe(true);

    setThemePreference('light');
    expect(system.count()).toBe(0);
    system.setDark(false);
    system.setDark(true);
    expect(isDark()).toBe(false);
  });

  it('never stacks listeners when the preference is set repeatedly', () => {
    const system = mockSystem(false);
    setThemePreference('system');
    setThemePreference('system');
    setThemePreference('system');
    expect(system.count()).toBe(1);
  });
});

describe('syncThemeFromUser', () => {
  it('adopts the account preference', () => {
    mockSystem(false);
    setThemePreference('light');
    syncThemeFromUser({ theme: 'dark' });
    expect(getThemePreference()).toBe('dark');
    expect(isDark()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('ignores missing or invalid values', () => {
    mockSystem(false);
    setThemePreference('dark');
    syncThemeFromUser({ theme: 'sepia' });
    syncThemeFromUser({});
    syncThemeFromUser(null);
    syncThemeFromUser(undefined);
    expect(getThemePreference()).toBe('dark');
  });
});
