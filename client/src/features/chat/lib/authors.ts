import type { ChatMessage, ChatUser } from '../types';

/**
 * Resolving who wrote a message (FR-092).
 *
 * A socket payload normally carries a populated author, but a payload that only carries an id (an
 * older emit, a message restored from local state, a `chat:updated` that arrived before the author was
 * populated) used to render as `Unknown member` until the page reloaded (AC-094, AC-095). The fix is a
 * pure lookup: prefer the populated author, fall back to the member directory by id, and only invent a
 * neutral placeholder for an id nobody knows.
 */

/** Shown when an id matches neither the payload nor the directory. Never used for a known member. */
export const UNKNOWN_AUTHOR: ChatUser = { _id: '', name: 'Unknown member' };

const directoryHit = (directory: readonly ChatUser[], id: string): ChatUser | null => (
  directory.find(member => member._id === id) ?? null
);

/**
 * The author of a message: the populated object when there is one, else the directory entry for the
 * id, else a placeholder. The placeholder carries the original id so a later render can still match it
 * against a directory that has since loaded.
 */
export const resolveAuthor = (
  message: ChatMessage,
  directory: readonly ChatUser[] = [],
): ChatUser => {
  const raw = message.author;
  const id = typeof raw === 'string' ? raw : raw?._id ?? '';
  if (id && directory.length > 0) {
    const known = directoryHit(directory, id);
    // A directory hit is the source of truth: it has a name and an avatar for a participant the
    // payload omitted, and it is at least as fresh as a payload carried over a slow socket
    if (known) return known;
  }

  if (typeof raw === 'string') return { ...UNKNOWN_AUTHOR, _id: raw };
  if (raw && typeof raw === 'object') return raw;
  return UNKNOWN_AUTHOR;
};

/** Convenience for callers that only need the display name. */
export const resolveAuthorName = (message: ChatMessage, directory: readonly ChatUser[] = []): string =>
  resolveAuthor(message, directory).name || UNKNOWN_AUTHOR.name;

/**
 * The id behind a message's author, populated or not. Used by the `mine` check, so a message the
 * caller sent still renders on their own side when its payload carries only an id.
 */
export const resolveAuthorId = (message: ChatMessage): string => {
  const raw = message.author;
  return typeof raw === 'string' ? raw : raw?._id ?? '';
};
