// Per-person capacity for the workload view, kept in the browser per workspace.

export const DEFAULT_CAPACITY = 10;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 200;

const storageKey = (slug: string) => `taskman.workload.capacity.${slug}`;

const storageOrNull = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // storage blocked (private mode, sandboxed iframe)
  }
};

/** A whole number of points between the limits; null for anything else. */
export const parseCapacity = (value: unknown): number | null => {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number >= MIN_CAPACITY && number <= MAX_CAPACITY ? number : null;
};

/** Saved capacity of the workspace, or the default when unset, invalid or storage is unavailable. */
export const loadCapacity = (slug: string): number => {
  try {
    return parseCapacity(storageOrNull()?.getItem(storageKey(slug))) ?? DEFAULT_CAPACITY;
  } catch {
    return DEFAULT_CAPACITY;
  }
};

export const saveCapacity = (slug: string, capacity: number): void => {
  try {
    storageOrNull()?.setItem(storageKey(slug), String(capacity));
  } catch {
    // Not saved: the value still applies for this visit
  }
};
