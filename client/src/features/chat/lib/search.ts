export interface SnippetSegment {
  text: string;
  match: boolean;
}

/** Longest snippet rendered in a result row, so a wall of text cannot push the list around. */
export const MAX_SNIPPET_LENGTH = 160;

/** Wrapping step through a list: `1 of 5` then `0` again when moving past the end. */
export const nextIndex = (current: number, length: number, delta: number): number => {
  if (length <= 0) return 0;
  return ((current + delta) % length + length) % length;
};

/** `3 of 12`; the trailing `+` says the server reported another page (spec AC-073). */
export const formatCounter = (index: number, loaded: number, hasMore: boolean): string => {
  if (loaded <= 0) return '0 of 0';
  return `${Math.min(index + 1, loaded)} of ${loaded}${hasMore ? '+' : ''}`;
};

/** Clips a message body around the first match so the highlighted word is actually visible. */
export const snippetFor = (body: string, term: string): string => {
  const text = body.replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_SNIPPET_LENGTH) return text;

  const needle = term.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at === -1) return `${text.slice(0, MAX_SNIPPET_LENGTH)}…`;

  const start = Math.max(0, at - 50);
  const end = Math.min(text.length, start + MAX_SNIPPET_LENGTH);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
};

/**
 * Splits a snippet into text and match segments so the caller can highlight every occurrence as
 * React nodes. Never returns HTML, so a body containing markup cannot become script (spec NFR-027).
 */
export const segmentSnippet = (text: string, term: string): SnippetSegment[] => {
  const needle = term.trim();
  if (!needle || !text) return [{ text, match: false }];

  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const segments: SnippetSegment[] = [];
  let cursor = 0;
  let at = lower.indexOf(target);

  while (at !== -1) {
    if (at > cursor) segments.push({ text: text.slice(cursor, at), match: false });
    segments.push({ text: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
    at = lower.indexOf(target, cursor);
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments.length > 0 ? segments : [{ text, match: false }];
};
