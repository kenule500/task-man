import mongoose from 'mongoose';

export const MESSAGE_PAGE_SIZE = 50;
// The page size is capped, so a caller cannot ask for the whole channel in one request
export const MAX_MESSAGE_PAGE_SIZE = 50;

/** Where a client stopped reading: the message's createdAt (ms) and its id as a tiebreak. */
export interface MessageCursor {
  at: Date;
  id: mongoose.Types.ObjectId;
}

const CURSOR_PATTERN = /^(\d{1,15})_([a-f0-9]{24})$/;

export const encodeMessageCursor = (message: { createdAt: Date; _id: unknown }): string =>
  `${message.createdAt.getTime()}_${String(message._id)}`;

/** Reads `"<ms>_<id>"`; anything else is rejected rather than coerced. */
export const decodeMessageCursor = (value: unknown): MessageCursor | null => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) return null;
  const match = CURSOR_PATTERN.exec(value);
  if (!match) return null;
  const at = new Date(Number(match[1]));
  if (Number.isNaN(at.getTime())) return null;
  return { at, id: new mongoose.Types.ObjectId(match[2]) };
};

export const clampPageSize = (value: unknown): number => {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return MESSAGE_PAGE_SIZE;
  return Math.min(Math.floor(size), MAX_MESSAGE_PAGE_SIZE);
};

/**
 * Messages strictly older than the cursor.
 * A range scan on (channel, createdAt, _id) satisfies this, and the `_id` tiebreak keeps paging
 * stable when several messages share a millisecond.
 */
export const olderThanCursor = (cursor: MessageCursor): Record<string, unknown> => ({
  $or: [
    { createdAt: { $lt: cursor.at } },
    { createdAt: cursor.at, _id: { $lt: cursor.id } },
  ],
});

/** Escapes a user-supplied term so it cannot inject regex operators (CON-516). */
export const escapeRegex = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const searchFilter = (term: string): Record<string, unknown> => ({
  body: { $regex: escapeRegex(term), $options: 'i' },
  // Deleted and purged messages never surface in search (spec AC-029)
  deletedAt: null,
});
