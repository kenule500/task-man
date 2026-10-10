// A saved view stores the task page's URL query string. Only the filter and board keys are allowed, so a
// saved view can never carry navigation state (`task`, `new`, `col`) or anything else the page might read.

export const SAVED_VIEW_QUERY_KEYS = ['q', 'status', 'priority', 'type', 'label', 'epic', 'assignedToMe', 'sort', 'qf', 'group'] as const;

export const MAX_SAVED_VIEW_QUERY = 1000;
const MAX_VALUE_LENGTH = 200;

/**
 * Validates a query string ("status=pending&assignedToMe=1", a leading "?" is accepted) and returns it normalised,
 * or `null` when it has an unknown key, a repeated key, a value that is too long or is longer than 1000 characters.
 * An empty string is valid (a view without filters).
 */
export const normalizeViewQuery = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const text = raw.startsWith('?') ? raw.slice(1) : raw;
  if (text.length > MAX_SAVED_VIEW_QUERY) return null;

  const params = new URLSearchParams(text);
  const seen = new Set<string>();
  const clean = new URLSearchParams();
  for (const [key, value] of params) {
    if (!(SAVED_VIEW_QUERY_KEYS as readonly string[]).includes(key) || seen.has(key)) return null;
    if (value.length > MAX_VALUE_LENGTH) return null;
    seen.add(key);
    clean.set(key, value);
  }
  const normalized = clean.toString();
  return normalized.length <= MAX_SAVED_VIEW_QUERY ? normalized : null;
};
