import mongoose from 'mongoose';
import { formatCursor, parseCursor, type ChangeCursor } from './changeCursor.js';
import { resolveMentions } from './notify.js';

// Pure helpers for team chat (unit tested): mentions, cursors, slugs, previews

export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 100;
export const PREVIEW_LENGTH = 100;

type Id = mongoose.Types.ObjectId | string;

/** Page size from a query value: a positive integer, capped; anything else gets the default. */
export const clampLimit = (value: unknown, fallback = DEFAULT_PAGE, max = MAX_PAGE): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

/** Cursor of a message: its createdAt (ms) and id, the same shape the change feed uses. */
export const messageCursor = (message: { createdAt: Date; _id: Id }): string =>
  formatCursor({ createdAt: message.createdAt, _id: message._id });

/** Reads a `before` / `after` query value as a cursor; `undefined` when absent, `null` when malformed. */
export const readCursor = (value: unknown): ChangeCursor | null | undefined => {
  if (value === undefined || value === '') return undefined;
  return parseCursor(value);
};

/** Mongo filter for messages strictly older than the cursor (cast Dates and ObjectIds only). */
export const beforeCursor = (cursor: ChangeCursor): Record<string, unknown> =>
  cursor.id
    ? { $or: [{ createdAt: { $lt: cursor.at } }, { createdAt: { $eq: cursor.at }, _id: { $lt: cursor.id } }] }
    : { createdAt: { $lt: cursor.at } };

/** Lower-case URL-safe slug that keeps letters of any script (Arabic and French names stay readable). */
export const slugifyChannel = (name: string): string => {
  const slug = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return slug || 'channel';
};

/** Stable key of a two-person conversation, whichever side opens it. */
export const dmKeyOf = (a: Id, b: Id): string => [String(a), String(b)].sort().join('_').slice(0, 60);

/** One line of a message for lists and notifications: whitespace collapsed, cut with an ellipsis. */
export const previewOf = (text: string, max = PREVIEW_LENGTH): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/**
 * Members tagged in a message. Same rules as comments ("@First Last", "@first" when unique), limited to
 * `allowed` ids when given (private channels only tag their own members) and never the author.
 */
export const parseChatMentions = (
  text: string,
  members: { id: string; name: string }[],
  options: { authorId?: Id; allowed?: Id[] | null } = {},
): string[] => {
  const allowed = options.allowed ? new Set(options.allowed.map(String)) : null;
  const author = options.authorId === undefined ? '' : String(options.authorId);
  const pool = members.filter(member => (!allowed || allowed.has(member.id)));
  return resolveMentions(text, pool).filter(id => id !== author);
};
