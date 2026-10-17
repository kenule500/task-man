export interface MentionMatch {
  /** Where the "@" starts in the text. */
  start: number;
  /** Where the typed term ends (exclusive). */
  end: number;
  term: string;
}

/**
 * Finds the mention the caret is inside, if any: `@` preceded by a boundary and followed by
 * a term with no whitespace. Returns null when the caret is not in a mention.
 */
export const activeMention = (text: string, caret: number): MentionMatch | null => {
  if (caret < 0 || caret > text.length) return null;
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  // "@" at the start or after whitespace only, so an email address does not trigger the menu
  if (at > 0 && !/[\s(]/.test(before[at - 1])) return null;
  const term = before.slice(at + 1);
  if (/[\s@]/.test(term)) return null;
  return { start: at, end: caret, term };
};

/** Replaces the active mention with the chosen name and a trailing space; returns the new text and caret. */
export const applyMention = (
  text: string,
  match: MentionMatch,
  name: string,
): { text: string; caret: number } => {
  const insert = `@${name.replace(/\s+/g, '')} `;
  const next = `${text.slice(0, match.start)}${insert}${text.slice(match.end)}`;
  return { text: next, caret: match.start + insert.length };
};

/** User ids whose `@name` appears in the text, matched case-insensitively against the candidate list. */
export const mentionedUserIds = (
  text: string,
  candidates: readonly { _id: string; name: string }[],
): string[] => {
  const found = new Set<string>();
  for (const candidate of candidates) {
    const token = `@${candidate.name.replace(/\s+/g, '')}`;
    const pattern = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i');
    if (pattern.test(text)) found.add(candidate._id);
  }
  return [...found];
};
