import {
  EMPTY_CURSOR, cursorOf, dayKeyOf, firstUnreadId, groupByDay, maxCursor, mergeMessages, newestCursor, removeMessage, startsRun,
} from '../lib/messages';
import { ANA, BEN, makeMessage } from './fixtures';

describe('mergeMessages', () => {
  it('orders by time and never duplicates a message that arrives twice', () => {
    const a = makeMessage({ text: 'a' });
    const b = makeMessage({ text: 'b' });
    const c = makeMessage({ text: 'c' });
    // The socket delivers c, the poll delivers b and c again, the history had a
    let list = mergeMessages([a], [c]);
    list = mergeMessages(list, [b, c]);
    list = mergeMessages(list, [c]);
    expect(list.map(message => message.text)).toEqual(['a', 'b', 'c']);
  });

  it('replaces an edited message and drops a deleted one', () => {
    const a = makeMessage({ text: 'a' });
    const b = makeMessage({ text: 'b' });
    const edited = { ...a, text: 'a (edited)', editedAt: '2026-03-01T11:00:00.000Z' };
    expect(mergeMessages([a, b], [edited]).map(message => message.text)).toEqual(['a (edited)', 'b']);
    expect(mergeMessages([a, b], [{ ...b, deleted: true, text: '' }]).map(message => message._id)).toEqual([a._id]);
  });

  it('breaks ties between identical timestamps by id', () => {
    const at = '2026-03-01T10:00:00.000Z';
    const second = makeMessage({ createdAt: at });
    const first = { ...makeMessage({ createdAt: at }), _id: '0'.repeat(23) + '1' };
    expect(mergeMessages([], [second, first]).map(message => message._id)).toEqual([first._id, second._id].sort());
  });

  it('removes by id and keeps the same array when nothing matches', () => {
    const a = makeMessage();
    const list = [a];
    expect(removeMessage(list, 'unknown')).toBe(list);
    expect(removeMessage(list, a._id)).toEqual([]);
  });
});

describe('cursors', () => {
  it('matches the server format and never moves back', () => {
    const message = makeMessage();
    expect(cursorOf(message)).toBe(`${new Date(message.createdAt).getTime()}_${message._id}`);
    const later = makeMessage();
    expect(maxCursor(cursorOf(message), cursorOf(later))).toBe(cursorOf(later));
    expect(maxCursor(cursorOf(later), cursorOf(message))).toBe(cursorOf(later));
    expect(maxCursor(EMPTY_CURSOR, cursorOf(message))).toBe(cursorOf(message));
  });

  it('starts from the empty cursor when there are no messages', () => {
    expect(newestCursor([])).toBe(EMPTY_CURSOR);
    const message = makeMessage();
    expect(newestCursor([message])).toBe(cursorOf(message));
  });
});

describe('grouping', () => {
  it('splits messages by local calendar day', () => {
    const morning = makeMessage({ createdAt: new Date(2026, 2, 1, 9, 0).toISOString() });
    const evening = makeMessage({ createdAt: new Date(2026, 2, 1, 23, 50).toISOString() });
    const next = makeMessage({ createdAt: new Date(2026, 2, 2, 0, 10).toISOString() });
    const groups = groupByDay([morning, evening, next]);
    expect(groups.map(group => group.key)).toEqual(['2026-03-01', '2026-03-02']);
    expect(groups[0].messages).toHaveLength(2);
    expect(dayKeyOf(evening.createdAt)).toBe('2026-03-01');
  });

  it('opens a new run for another author, a long pause or a new day', () => {
    const first = makeMessage({ author: ANA, createdAt: new Date(2026, 2, 1, 9, 0).toISOString() });
    const soon = makeMessage({ author: ANA, createdAt: new Date(2026, 2, 1, 9, 2).toISOString() });
    const later = makeMessage({ author: ANA, createdAt: new Date(2026, 2, 1, 9, 30).toISOString() });
    const other = makeMessage({ author: BEN, createdAt: new Date(2026, 2, 1, 9, 31).toISOString() });
    expect(startsRun(undefined, first)).toBe(true);
    expect(startsRun(first, soon)).toBe(false);
    expect(startsRun(soon, later)).toBe(true);
    expect(startsRun(later, other)).toBe(true);
  });
});

describe('firstUnreadId', () => {
  const mine = makeMessage({ author: ANA });
  const theirs = [makeMessage({ author: BEN }), makeMessage({ author: BEN }), makeMessage({ author: BEN })];
  const all = [theirs[0], mine, theirs[1], theirs[2]];

  it('points at the oldest of the unread messages from other people', () => {
    expect(firstUnreadId(all, ANA._id, 2)).toBe(theirs[1]._id);
    expect(firstUnreadId(all, ANA._id, 1)).toBe(theirs[2]._id);
  });

  it('falls back to the first message when more are unread than loaded, and to null when none are', () => {
    expect(firstUnreadId(all, ANA._id, 50)).toBe(theirs[0]._id);
    expect(firstUnreadId(all, ANA._id, 0)).toBeNull();
    expect(firstUnreadId([mine], ANA._id, 3)).toBeNull();
  });
});
