export const MIN_KEY_LENGTH = 2;
export const MAX_KEY_LENGTH = 6;

const STOP_WORDS = new Set(['and', 'the', 'of', 'for', 'a', 'an', 'to', 'in', 'on']);

const wordsOf = (name: string): string[] =>
  name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter(Boolean);

/**
 * Suggests a short project code from its name: initials of 2+ words ("Mobile App Redesign" -> "MAR"),
 * otherwise the first letters of the single word ("Website" -> "WEB"). Empty when the name has no letters or digits.
 */
export const suggestProjectKey = (name: string): string => {
  const parts = wordsOf(name);
  const significant = parts.filter(word => !STOP_WORDS.has(word.toLowerCase()));
  const usable = significant.length > 0 ? significant : parts;
  if (usable.length === 0) return '';

  const raw = usable.length >= 2 ? usable.map(word => word[0]).join('') : usable[0].slice(0, 3);
  const key = raw.toUpperCase().slice(0, MAX_KEY_LENGTH);
  // A single short word ("X") cannot make a valid key: let the user type one
  return key.length >= MIN_KEY_LENGTH ? key : '';
};

/** Uppercases and strips everything but letters and digits while the user types. */
export const normalizeProjectKey = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_KEY_LENGTH);

export const isValidProjectKey = (key: string): boolean => /^[A-Z0-9]{2,6}$/.test(key);
