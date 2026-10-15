// @mentions in comments: highlighting posted text and the autocomplete in the comment box.
// The server resolves mentions with the same names ("@First Last" or a unique "@first").

export interface MentionCandidate {
  _id: string;
  name: string;
  avatarUrl?: string;
}

export interface MentionSegment {
  text: string;
  mention: boolean;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const WORD = '[\\p{L}\\p{N}_]';

/**
 * Splits comment text into plain and "@Name" parts. With `names` only those names (and their first
 * names) are highlighted, longest first; without names any "@word" is.
 */
export const splitMentions = (text: string, names: string[] = []): MentionSegment[] => {
  if (!text.includes('@')) return [{ text, mention: false }];

  const labels = new Set<string>();
  for (const name of names) {
    const full = name.trim().replace(/\s+/g, ' ');
    if (!full) continue;
    labels.add(full);
    labels.add(full.split(' ')[0]);
  }
  const alternatives = [...labels]
    .sort((a, b) => b.length - a.length)
    .map(label => escapeRegExp(label).replace(/ /g, '\\s+'));
  const body = alternatives.length > 0 ? `(?:${alternatives.join('|')})` : `${WORD}+`;
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_@])(@${body})(?!${WORD})`, 'giu');

  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = (match.index ?? 0) + match[1].length;
    if (start > cursor) segments.push({ text: text.slice(cursor, start), mention: false });
    segments.push({ text: match[2], mention: true });
    cursor = start + match[2].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), mention: false });
  return segments.length > 0 ? segments : [{ text, mention: false }];
};

export interface ActiveMention {
  /** Index of the "@" in the text. */
  start: number;
  /** What was typed after it, up to the caret. */
  query: string;
}

const MAX_QUERY = 40;

/** The "@query" being typed right before the caret, or null (an "@" inside a word, like an email, does not count). */
export const activeMention = (text: string, caret: number): ActiveMention | null => {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (query.length > MAX_QUERY || /[\n\t]/.test(query)) return null;
  // A name may contain one space ("@Ada Lo"); a second space ends the mention
  if ((query.match(/ /g) ?? []).length > 1) return null;
  return { start, query };
};

/** Members whose name (or a word of it) starts with the query; people already earlier in the list keep their order. */
export const filterMentionCandidates = (
  members: MentionCandidate[],
  query: string,
  limit = 6,
): MentionCandidate[] => {
  const needle = query.trim().toLowerCase();
  const matches = members.filter(member => {
    const name = member.name.toLowerCase();
    if (!needle) return true;
    return name.startsWith(needle) || name.split(/\s+/).some(word => word.startsWith(needle));
  });
  return matches.slice(0, limit);
};

/** Replaces the "@query" with "@Name " and returns the new text and caret position. */
export const insertMention = (
  text: string,
  mention: ActiveMention,
  caret: number,
  name: string,
): { text: string; caret: number } => {
  const rest = text.slice(caret);
  // One space after the name, reusing the one that is already there
  const spacer = /^\s/.test(rest) ? '' : ' ';
  const label = `@${name}`;
  return {
    text: `${text.slice(0, mention.start)}${label}${spacer}${rest}`,
    caret: mention.start + label.length + 1,
  };
};
