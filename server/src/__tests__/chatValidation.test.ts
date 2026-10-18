import mongoose from 'mongoose';
import { MAX_MESSAGE_BODY } from '../models/chatMessageModel.js';
import { MAX_MENTIONS } from '../utils/chatMentions.js';
import { parseMessageInput } from '../utils/chatValidation.js';

const id = () => new mongoose.Types.ObjectId().toString();

describe('chat message validation', () => {
  it('AC-007: refuses an empty body with no attachment', () => {
    expect(parseMessageInput({ body: '   ' })).toEqual({ ok: false, error: 'A message needs text or an attachment' });
    expect(parseMessageInput(null)).toEqual({ ok: false, error: 'Invalid message' });
  });

  it('AC-021: accepts an attachment-only message and trims the body', () => {
    expect(parseMessageInput({ body: '  hello  ', attachmentIds: ['file-1'] })).toEqual({
      ok: true,
      value: { body: 'hello', parentId: null, attachmentIds: ['file-1'], mentionIds: [] },
    });
    expect(parseMessageInput({ body: '', attachmentIds: ['file-1'] })).toEqual({
      ok: true,
      value: { body: '', parentId: null, attachmentIds: ['file-1'], mentionIds: [] },
    });
  });

  it('AC-010: refuses a body over the limit', () => {
    const result = parseMessageInput({ body: 'x'.repeat(MAX_MESSAGE_BODY + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(MAX_MESSAGE_BODY));
  });

  it('AC-012: accepts a valid parent and refuses a malformed one', () => {
    const parentId = id();
    expect(parseMessageInput({ body: 'reply', parentId })).toEqual({
      ok: true,
      value: { body: 'reply', parentId, attachmentIds: [], mentionIds: [] },
    });
    expect(parseMessageInput({ body: 'reply', parentId: 'not-an-id' }))
      .toEqual({ ok: false, error: 'Invalid parent message' });
  });

  it('AC-014: keeps only valid, unique mentions and caps them', () => {
    const valid = Array.from({ length: MAX_MENTIONS + 5 }, () => id());
    const result = parseMessageInput({ body: 'hi', mentionIds: [...valid, valid[0], 'nope', 42] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mentionIds).toHaveLength(MAX_MENTIONS);
      expect(new Set(result.value.mentionIds).size).toBe(MAX_MENTIONS);
      expect(result.value.mentionIds).not.toContain('nope');
    }
  });
});
