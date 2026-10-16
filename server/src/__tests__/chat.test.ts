import mongoose from 'mongoose';
import {
  beforeCursor, clampLimit, dmKeyOf, messageCursor, parseChatMentions, previewOf, readCursor, slugifyChannel,
} from '../utils/chat.js';
import { audienceRooms, canAccessChannel } from '../utils/chatService.js';
import { createSocketLimiter, createThrottle, isPlainObject } from '../realtime/rateLimiter.js';

const members = [
  { id: 'u-ann', name: 'Ann Lee' },
  { id: 'u-dan', name: 'Daniel Smith' },
  { id: 'u-bob', name: 'Bob Stone' },
  { id: 'u-bo2', name: 'Bob Marsh' },
];

describe('parseChatMentions', () => {
  it('finds full names and unique first names, ignoring case', () => {
    expect(parseChatMentions('hi @ann lee and @DANIEL, ping', members).sort()).toEqual(['u-ann', 'u-dan']);
  });

  it('skips ambiguous first names and partial words', () => {
    expect(parseChatMentions('@bob please', members)).toEqual([]);
    expect(parseChatMentions('@Bob Stone yes', members)).toEqual(['u-bob']);
    expect(parseChatMentions('@Dan is not Daniel', members)).toEqual([]);
  });

  it('never tags the author and stays inside the allowed members', () => {
    expect(parseChatMentions('@Ann Lee @Daniel', members, { authorId: 'u-ann' })).toEqual(['u-dan']);
    expect(parseChatMentions('@Ann Lee @Daniel', members, { allowed: ['u-dan'] })).toEqual(['u-dan']);
  });

  it('ignores text without mentions and e-mail addresses', () => {
    expect(parseChatMentions('no tags here', members)).toEqual([]);
    expect(parseChatMentions('mail me at x@ann.com', members)).toEqual([]);
  });
});

describe('cursor helpers', () => {
  const id = new mongoose.Types.ObjectId();
  const createdAt = new Date('2026-03-01T10:00:00.000Z');

  it('formats and reads the same cursor shape as the change feed', () => {
    const cursor = messageCursor({ createdAt, _id: id });
    expect(cursor).toBe(`${createdAt.getTime()}_${String(id)}`);
    expect(readCursor(cursor)).toEqual({ at: createdAt, id });
  });

  it('distinguishes absent from malformed cursors', () => {
    expect(readCursor(undefined)).toBeUndefined();
    expect(readCursor('')).toBeUndefined();
    expect(readCursor('nope')).toBeNull();
    expect(readCursor({ $gt: '' })).toBeNull();
  });

  it('builds a strictly-older filter with an id tiebreak', () => {
    const cursor = readCursor(messageCursor({ createdAt, _id: id }))!;
    expect(beforeCursor(cursor)).toEqual({
      $or: [{ createdAt: { $lt: createdAt } }, { createdAt: { $eq: createdAt }, _id: { $lt: id } }],
    });
    expect(beforeCursor({ at: createdAt, id: null })).toEqual({ createdAt: { $lt: createdAt } });
  });

  it('clamps page sizes', () => {
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit('20')).toBe(20);
    expect(clampLimit('5000')).toBe(100);
    expect(clampLimit('-3')).toBe(50);
    expect(clampLimit('abc')).toBe(50);
  });
});

describe('text helpers', () => {
  it('slugifies names in any script', () => {
    expect(slugifyChannel('Design  Team!')).toBe('design-team');
    expect(slugifyChannel('Équipe Été')).toBe('équipe-été');
    expect(slugifyChannel('فريق التصميم')).toBe('فريق-التصميم');
    expect(slugifyChannel('!!!')).toBe('channel');
  });

  it('gives a pair of people one key whichever side asks', () => {
    expect(dmKeyOf('b', 'a')).toBe(dmKeyOf('a', 'b'));
    expect(dmKeyOf('a', 'b')).not.toBe(dmKeyOf('a', 'c'));
  });

  it('flattens and shortens previews', () => {
    expect(previewOf('hello\n\n  world')).toBe('hello world');
    expect(previewOf('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('channel access', () => {
  const ws = new mongoose.Types.ObjectId();
  const me = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  const ctx = { workspace: { _id: ws, slug: 's', name: 'S', members: [] }, userId: String(me), permissions: ['tasks:read', 'projects:read'] };

  it('lets members read public and project channels', () => {
    expect(canAccessChannel(ctx, { workspace: ws, type: 'team' })).toBe(true);
    expect(canAccessChannel(ctx, { workspace: ws, type: 'project' })).toBe(true);
  });

  it('keeps direct and private channels to their members', () => {
    expect(canAccessChannel(ctx, { workspace: ws, type: 'dm', members: [me, other] })).toBe(true);
    expect(canAccessChannel(ctx, { workspace: ws, type: 'dm', members: [other] })).toBe(false);
    expect(canAccessChannel(ctx, { workspace: ws, type: 'team', private: true, members: [other] })).toBe(false);
  });

  it('refuses other workspaces and missing permissions', () => {
    expect(canAccessChannel(ctx, { workspace: new mongoose.Types.ObjectId(), type: 'team' })).toBe(false);
    expect(canAccessChannel({ ...ctx, permissions: [] }, { workspace: ws, type: 'team' })).toBe(false);
    expect(canAccessChannel({ ...ctx, permissions: ['tasks:read'] }, { workspace: ws, type: 'project' })).toBe(false);
  });

  it('addresses events to the workspace, or to each member of private channels', () => {
    expect(audienceRooms({ workspace: ws, type: 'team' })).toEqual([`ws:${String(ws)}`]);
    expect(audienceRooms({ workspace: ws, type: 'dm', members: [me, other] })).toEqual([`user:${String(me)}`, `user:${String(other)}`]);
  });
});

describe('socket rate limits', () => {
  it('allows a burst up to the budget, then refuses until the window passes', () => {
    const limiter = createSocketLimiter(3, 1000);
    expect([0, 100, 200].map(at => limiter.allow(at))).toEqual([true, true, true]);
    expect(limiter.allow(300)).toBe(false);
    expect(limiter.allow(1001)).toBe(true);
  });

  it('throttles per key', () => {
    const allow = createThrottle(2000);
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 500)).toBe(false);
    expect(allow('b', 500)).toBe(true);
    expect(allow('a', 2500)).toBe(true);
  });

  it('recognises plain objects only', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });
});
