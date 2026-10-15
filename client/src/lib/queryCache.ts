/**
 * Tiny in-memory stale-while-revalidate cache for list endpoints (tasks, projects).
 *
 * - Entries live for `MAX_AGE_MS` (5 minutes); older ones are treated as missing.
 * - Hooks start from a cached value (no skeleton), then revalidate in the background.
 * - Identical in-flight requests are shared (`fetchCached`), unless `force` is set (after a mutation).
 * - The whole cache is dropped on logout / login (`clearCache`), so one user's data never reaches the next.
 * It is deliberately memory-only: nothing is written to localStorage.
 */

export const MAX_AGE_MS = 5 * 60 * 1000;

interface Entry {
  data: unknown;
  at: number;
}

type Listener = () => void;

const store = new Map<string, Entry>();
const listeners = new Map<string, Set<Listener>>();
const inflight = new Map<string, Promise<unknown>>();

export const tasksKey = (slug: string): string => `tasks:${slug}`;
export const projectsKey = (slug: string): string => `projects:${slug}`;

const notify = (key: string): void => {
  listeners.get(key)?.forEach(listener => listener());
};

/** The cached value, or `undefined` when missing or older than `maxAgeMs`. */
export const getCached = <T>(key: string, maxAgeMs: number = MAX_AGE_MS): T | undefined => {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > maxAgeMs) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
};

/** Stores a value and tells subscribers. Writing the very same reference again is a no-op (keeps its age). */
export const setCached = <T>(key: string, data: T): void => {
  if (store.get(key)?.data === data) return;
  store.set(key, { data, at: Date.now() });
  notify(key);
};

/** Calls `listener` whenever `key` is written or invalidated; returns the unsubscribe function. */
export const subscribe = (key: string, listener: Listener): (() => void) => {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0 && listeners.get(key) === set) listeners.delete(key);
  };
};

/** Drops one key (and forgets its in-flight request, so the next load asks the server again). */
export const invalidate = (key: string): void => {
  store.delete(key);
  inflight.delete(key);
  notify(key);
};

/** Drops every key starting with `prefix`, e.g. `tasks:` for all workspaces. */
export const invalidatePrefix = (prefix: string): void => {
  for (const key of [...store.keys(), ...inflight.keys()]) {
    if (key.startsWith(prefix)) invalidate(key);
  }
};

/** Empties the cache; used on logout and login. */
export const clearCache = (): void => {
  store.clear();
  inflight.clear();
};

/**
 * Runs `fetcher`; concurrent calls for the same key share one request, so screens mounting together ask the server once.
 * It does not write to the cache: the caller decides whether the response is still current (it may have local
 * changes that are newer) and then calls `setCached`.
 * `force` always starts a new request (the old one is left to finish but is no longer shared).
 */
export const fetchCached = <T>(key: string, fetcher: () => Promise<T>, force = false): Promise<T> => {
  const existing = inflight.get(key);
  if (existing && !force) return existing as Promise<T>;

  const request: Promise<T> = fetcher().finally(() => {
    if (inflight.get(key) === request) inflight.delete(key);
  });
  inflight.set(key, request);
  return request;
};
