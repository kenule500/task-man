import type { ChatMember } from '../types';

export const MAX_SUGGESTIONS = 6;
const MAX_QUERY = 40;

export interface MentionQuery {
  /** Index of the "@" in the text */
  start: number;
  /** Text typed after it */
  query: string;
}

/**
 * The mention being typed at the caret: an "@" at the start of the text or after whitespace, followed by up to
 * two words. `null` when the caret is not inside one (so the suggestion list stays closed).
 */
export const findMentionQuery = (text: string, caret: number): MentionQuery | null => {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([\p{L}\p{N}_.’-]*(?: [\p{L}\p{N}_.’-]*)?)$/u.exec(before);
  if (!match || match[2].length > MAX_QUERY) return null;
  return { start: caret - match[2].length - 1, query: match[2] };
};

const normalize = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Members whose name (or any word of it) starts with the query, then the ones that merely contain it. */
export const filterMembers = (members: ChatMember[], query: string, excludeId?: string): ChatMember[] => {
  const needle = normalize(query.trim());
  const pool = members.filter(member => member._id !== excludeId);
  if (!needle) return pool.slice(0, MAX_SUGGESTIONS);
  const starts: ChatMember[] = [];
  const contains: ChatMember[] = [];
  for (const member of pool) {
    const name = normalize(member.name);
    if (name.startsWith(needle) || name.split(/\s+/).some(word => word.startsWith(needle))) starts.push(member);
    else if (name.includes(needle)) contains.push(member);
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
};

/** Replaces the "@query" being typed with "@Full Name " and returns the new text and caret position. */
export const insertMention = (
  text: string,
  mention: MentionQuery,
  caret: number,
  name: string,
): { text: string; caret: number } => {
  const inserted = `@${name} `;
  const next = `${text.slice(0, mention.start)}${inserted}${text.slice(caret)}`;
  return { text: next, caret: mention.start + inserted.length };
};

export interface TextSegment {
  text: string;
  mention: boolean;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits message text so "@Full Name" of known members can be highlighted; everything else stays plain text. */
export const splitMentions = (text: string, members: ChatMember[]): TextSegment[] => {
  if (!text.includes('@') || members.length === 0) return [{ text, mention: false }];
  const names = [...new Set(members.map(member => member.name.trim().replace(/\s+/g, ' ')).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_@])(@(?:${names.map(escapeRegExp).join('|')}))(?![\\p{L}\\p{N}_])`, 'giu');

  const segments: TextSegment[] = [];
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
