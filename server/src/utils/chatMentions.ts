/** A message may mention a bounded number of people; the rest are dropped. */
export const MAX_MENTIONS = 20;

/** First `max` characters of a message, collapsed to one line — used for notification summaries. */
export const snippetOf = (body: string, max = 120): string => {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1))}…`;
};

export const uniqueIds = (ids: readonly string[]): string[] => [...new Set(ids.map(String))];
