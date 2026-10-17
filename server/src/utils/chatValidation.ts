import mongoose from 'mongoose';
import { MAX_MESSAGE_BODY } from '../models/chatMessageModel.js';
import { MAX_MENTIONS } from './chatMentions.js';

export interface MessageInput {
  body: string;
  parentId: string | null;
  attachmentIds: string[];
  mentionIds: string[];
}

export type MessageInputResult =
  | { ok: true; value: MessageInput }
  | { ok: false; error: string };

/**
 * Validates a message payload from either HTTP or a socket event, so both paths enforce the same rules.
 * A message needs text or at least one attachment; an empty body is refused rather than persisted.
 */
export const parseMessageInput = (raw: unknown): MessageInputResult => {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Invalid message' };
  }

  const input = raw as {
    body?: unknown;
    parentId?: unknown;
    attachmentIds?: unknown;
    mentionIds?: unknown;
  };
  const body = typeof input.body === 'string' ? input.body.trim() : '';

  const attachmentIds = Array.isArray(input.attachmentIds)
    ? input.attachmentIds.filter(id => typeof id === 'string' && id.length > 0).map(String)
    : [];

  if (!body && attachmentIds.length === 0) {
    return { ok: false, error: 'A message needs text or an attachment' };
  }
  if (body.length > MAX_MESSAGE_BODY) {
    return { ok: false, error: `Messages are limited to ${MAX_MESSAGE_BODY} characters` };
  }

  const parentRaw = input.parentId;
  const parentId = parentRaw === null || parentRaw === undefined || parentRaw === ''
    ? null
    : String(parentRaw);

  if (parentId !== null && !mongoose.isValidObjectId(parentId)) {
    return { ok: false, error: 'Invalid parent message' };
  }

  // Mentions arrive as user ids; malformed ones are dropped rather than failing the whole message
  const rawMentions: unknown[] = Array.isArray(input.mentionIds) ? input.mentionIds : [];
  const mentionIds = [...new Set(
    rawMentions
      .filter((id): id is string => typeof id === 'string' && mongoose.isValidObjectId(id))
      .map(String),
  )].slice(0, MAX_MENTIONS);

  return { ok: true, value: { body, parentId, attachmentIds, mentionIds } };
};
