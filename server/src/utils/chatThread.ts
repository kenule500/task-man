import type mongoose from 'mongoose';

/** The parent summary a reply emits, so every member's row updates from one authoritative value. */
export interface ChatThreadUpdate {
  channelId: string;
  messageId: string;
  replyCount: number;
  lastReplyAuthor: string | null;
}

/**
 * Shapes the thread update from the parent *after* its reply count was incremented (AC-115).
 *
 * The payload carries the stored count rather than a delta: a client that missed an event therefore
 * recovers on its next load instead of drifting, and two replies arriving together cannot double-count
 * (RISK-016). It is pure so `/sdrive:test` can cover the shapes without a database.
 */
export const threadUpdateOf = ({
  channelId, parentId, replyCount, lastReplyAuthor,
}: {
  channelId: string;
  parentId: string;
  replyCount: number | null | undefined;
  lastReplyAuthor: mongoose.Types.ObjectId | string | null | undefined;
}): ChatThreadUpdate => ({
  channelId: String(channelId),
  messageId: String(parentId),
  replyCount: typeof replyCount === 'number' && Number.isFinite(replyCount) ? replyCount : 0,
  lastReplyAuthor: lastReplyAuthor ? String(lastReplyAuthor) : null,
});

export default threadUpdateOf;
