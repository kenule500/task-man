import mongoose from 'mongoose';
import {
  MESSAGE_PAGE_SIZE, clampPageSize, decodeMessageCursor, encodeMessageCursor, olderThanCursor, searchFilter,
} from '../utils/chatQuery.js';

const ID = '65f1c0ffee0123456789abcd';

describe('chat query helpers', () => {
  it('AC-010: round-trips a message cursor', () => {
    const cursor = encodeMessageCursor({ createdAt: new Date(1_700_000_000_123), _id: ID });
    expect(cursor).toBe(`1700000000123_${ID}`);

    const parsed = decodeMessageCursor(cursor);
    expect(parsed?.at.getTime()).toBe(1_700_000_000_123);
    expect(String(parsed?.id)).toBe(ID);
  });

  it('AC-010: rejects malformed cursors instead of coercing them', () => {
    for (const bad of ['', 'now', '12_abc', `1_${ID}x`, 'x'.repeat(41), undefined, 12, { at: 1 }]) {
      expect(decodeMessageCursor(bad)).toBeNull();
    }
  });

  it('AC-010: builds a strict older-than filter with an id tiebreak', () => {
    expect(olderThanCursor({ at: new Date(5), id: new mongoose.Types.ObjectId(ID) })).toEqual({
      $or: [
        { createdAt: { $lt: new Date(5) } },
        { createdAt: new Date(5), _id: { $lt: new mongoose.Types.ObjectId(ID) } },
      ],
    });
  });

  it('AC-010: caps the page size so one request cannot read a whole channel', () => {
    expect(clampPageSize(undefined)).toBe(MESSAGE_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(MESSAGE_PAGE_SIZE);
    expect(clampPageSize('10')).toBe(10);
    expect(clampPageSize(9999)).toBe(MESSAGE_PAGE_SIZE);
  });

  it('AC-029/NFR-011: escapes the search term and excludes tombstones', () => {
    const filter = searchFilter('a.*b(') as { body: { $regex: string }; deletedAt: null };
    expect(filter.body.$regex).toBe('a\\.\\*b\\(');
    expect(filter.deletedAt).toBeNull();
  });
});
