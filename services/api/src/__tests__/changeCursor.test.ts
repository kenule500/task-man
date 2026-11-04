import mongoose from 'mongoose';
import { EMPTY_CURSOR, afterCursor, formatCursor, hiddenActions, parseCursor } from '../utils/changeCursor.js';

const ID = '65f1c0ffee0123456789abcd';

describe('change cursor', () => {
  it('round-trips a cursor', () => {
    const cursor = formatCursor({ createdAt: new Date(1_700_000_000_123), _id: ID });
    expect(cursor).toBe(`1700000000123_${ID}`);
    const parsed = parseCursor(cursor);
    expect(parsed?.at.getTime()).toBe(1_700_000_000_123);
    expect(String(parsed?.id)).toBe(ID);
  });

  it('reads ISO dates and the empty cursor, and rejects everything else', () => {
    expect(parseCursor('2026-01-02T03:04:05.678Z')?.id).toBeNull();
    expect(parseCursor(EMPTY_CURSOR)?.at.getTime()).toBe(0);
    for (const bad of ['', 'now', '12_abc', '2026-01-02', `1_${ID}x`, { $gt: 1 }, ['1'], undefined, 'x'.repeat(41)]) {
      expect(parseCursor(bad)).toBeNull();
    }
  });

  it('builds a strict "after" filter from cast values only', () => {
    const withId = afterCursor({ at: new Date(5), id: new mongoose.Types.ObjectId(ID) });
    expect(withId).toEqual({
      $or: [{ createdAt: { $gt: new Date(5) } }, { createdAt: { $eq: new Date(5) }, _id: { $gt: new mongoose.Types.ObjectId(ID) } }],
    });
    expect(afterCursor({ at: new Date(5), id: null })).toEqual({ createdAt: { $gt: new Date(5) } });
  });

  it('hides audit-only areas without settings:manage and projects without projects:read', () => {
    expect(hiddenActions(['tasks:read', 'projects:read'])).toEqual(
      expect.arrayContaining(['audit.exported', 'token.created', 'webhook.deleted']),
    );
    expect(hiddenActions(['tasks:read', 'projects:read'])).not.toContain('project.created');
    expect(hiddenActions(['tasks:read', 'projects:read', 'settings:manage'])).toEqual([]);
    expect(hiddenActions(['tasks:read', 'settings:manage'])).toEqual(
      expect.arrayContaining(['project.created', 'sprint.started']),
    );
  });
});
