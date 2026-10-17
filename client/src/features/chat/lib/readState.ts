/**
 * Per-browser last-visit timestamps for channels, used to show unread dots.
 * Kept in localStorage through one module so components never touch storage keys directly (CON-204).
 */
const STORAGE_KEY = 'chat:lastRead';

type ReadMap = Record<string, string>;

const readAll = (): ReadMap => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as ReadMap) : {};
  } catch {
    return {};
  }
};

export const getLastRead = (channelId: string): string | undefined => readAll()[channelId];

export const setLastRead = (channelId: string): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [channelId]: new Date().toISOString() }));
  } catch {
    // Storage can be full or blocked; unread dots are cosmetic and must not break the page
  }
};

export const allLastRead = (): ReadMap => readAll();
