/**
 * A relative app path or nothing. Rejects absolute URLs, protocol-relative `//host`, backslashes (some browsers treat
 * `/\host` like `//host`), control characters and anything that does not parse back to the same origin.
 */
export const safeRedirectPath = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 300) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const parsed = new URL(value, 'http://sso.invalid');
    if (parsed.origin !== 'http://sso.invalid') return null;
  } catch {
    return null;
  }
  return value;
};
