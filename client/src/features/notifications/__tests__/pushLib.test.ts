import { baseState, urlBase64ToUint8Array } from '../lib/push';
import { emptySeen, findNewUnread, markSeen } from '../lib/newItems';
import { makeNotification } from './fixtures';

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    // "hello" is aGVsbG8 without padding
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8'))).toEqual([104, 101, 108, 108, 111]);
  });

  it('maps the url-safe alphabet (- and _) to + and /', () => {
    // bytes 251, 255, 190 encode to "-_--" in base64url ("+/++" in base64)
    expect(Array.from(urlBase64ToUint8Array('-_--'))).toEqual([251, 255, 190]);
  });

  it('accepts padded input and surrounding whitespace', () => {
    expect(Array.from(urlBase64ToUint8Array(' aGVsbG8= '))).toEqual([104, 101, 108, 108, 111]);
  });

  it('decodes a 65 byte VAPID public key', () => {
    const bytes = urlBase64ToUint8Array(`B${'A'.repeat(86)}`);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

describe('baseState', () => {
  const ok = { supported: true, serverEnabled: true, permission: 'default' as NotificationPermission };

  it('picks the most specific reason push is not available', () => {
    expect(baseState({ ...ok, supported: false })).toBe('unsupported');
    expect(baseState({ ...ok, serverEnabled: false })).toBe('unavailable');
    expect(baseState({ ...ok, permission: 'denied' })).toBe('denied');
    expect(baseState(ok)).toBe('off');
    expect(baseState({ ...ok, permission: 'granted' })).toBe('off');
  });
});

describe('findNewUnread', () => {
  const base = Date.UTC(2026, 0, 1, 12, 0);
  const at = (id: string, minutesAgo: number, extra = {}) =>
    makeNotification({ _id: id, createdAt: new Date(base - minutesAgo * 60_000).toISOString(), ...extra });

  it('returns unseen unread items, oldest first', () => {
    const seen = markSeen(emptySeen(), [at('a', 10)]);
    expect(findNewUnread(seen, [at('c', 1), at('b', 5), at('a', 10)]).map(item => item._id)).toEqual(['b', 'c']);
  });

  it('ignores read items and older ones that merely slid into the list', () => {
    const seen = markSeen(emptySeen(), [at('a', 10)]);
    const items = [at('r', 1, { readAt: '2026-01-01T12:00:00.000Z' }), at('old', 60), at('a', 10)];
    expect(findNewUnread(seen, items)).toEqual([]);
  });

  it('treats everything as new from an empty list', () => {
    expect(findNewUnread(markSeen(emptySeen(), []), [at('a', 1)]).map(item => item._id)).toEqual(['a']);
  });
});
