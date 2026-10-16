import {
  applyActivity, canManageChannel, clearUnread, dmPartner, groupChannels, removeChannel, sumUnread, upsertChannel,
} from '../lib/channels';
import { activeTypers, noteTyping, pruneTyping, TYPING_TTL_MS } from '../lib/typing';
import { CHANNEL_POLL_INTERVAL_MS, POLL_INTERVAL_MS, SOCKET_PATH, socketOrigin } from '../lib/socketConfig';
import type { ChatActivity } from '../types';
import { ANA, BEN, makeChannel } from './fixtures';

const general = makeChannel();
const design = makeChannel({ _id: 'c-design', name: 'design', slug: 'design', isDefault: false, createdBy: ANA._id });
const project = makeChannel({ _id: 'c-web', name: 'Website', slug: 'project-website', type: 'project', project: 'Website', isDefault: false });
const dmOld = makeChannel({ _id: 'c-dm1', type: 'dm', private: true, isDefault: false, members: [ANA, BEN], lastMessageAt: '2026-03-01T10:00:00.000Z' });
const dmNew = makeChannel({ _id: 'c-dm2', type: 'dm', private: true, isDefault: false, members: [ANA, { ...BEN, _id: 'u-x', name: 'X' }], lastMessageAt: '2026-03-02T10:00:00.000Z' });

const activity = (overrides: Partial<ChatActivity> = {}): ChatActivity => ({
  workspace: 'w1', channelId: 'c-design', messageId: 'm1', authorId: BEN._id, authorName: BEN.name, preview: 'hello',
  createdAt: '2026-03-03T10:00:00.000Z', mentions: [], ...overrides,
});

describe('groupChannels', () => {
  it('sections channels, with #general first and direct messages by recent activity', () => {
    const groups = groupChannels([dmOld, design, project, dmNew, general]);
    expect(groups.team.map(channel => channel._id)).toEqual(['c-general', 'c-design']);
    expect(groups.projects.map(channel => channel._id)).toEqual(['c-web']);
    expect(groups.direct.map(channel => channel._id)).toEqual(['c-dm2', 'c-dm1']);
  });

  it('finds the other person of a direct message', () => {
    expect(dmPartner(dmOld, ANA._id)?.name).toBe(BEN.name);
    expect(dmPartner(general, ANA._id)).toBeNull();
  });
});

describe('applyActivity', () => {
  it('counts a message from someone else as unread and updates the preview', () => {
    const { channels, known } = applyActivity([general, design], activity(), { selfId: ANA._id, activeId: null });
    expect(known).toBe(true);
    const updated = channels.find(channel => channel._id === 'c-design')!;
    expect(updated.unread).toBe(1);
    expect(updated.lastMessage).toMatchObject({ _id: 'm1', text: 'hello', author: { name: BEN.name } });
    expect(updated.lastMessageAt).toBe('2026-03-03T10:00:00.000Z');
    expect(sumUnread(channels)).toBe(1);
  });

  it('does not count your own messages or the channel you are looking at', () => {
    expect(applyActivity([design], activity({ authorId: ANA._id }), { selfId: ANA._id, activeId: null }).channels[0].unread).toBe(0);
    expect(applyActivity([design], activity(), { selfId: ANA._id, activeId: 'c-design' }).channels[0].unread).toBe(0);
  });

  it('ignores a notice it has already applied and reports unknown channels', () => {
    const once = applyActivity([design], activity(), { selfId: ANA._id, activeId: null }).channels;
    expect(applyActivity(once, activity(), { selfId: ANA._id, activeId: null }).channels[0].unread).toBe(1);
    expect(applyActivity([general], activity({ channelId: 'c-new' }), { selfId: ANA._id, activeId: null }).known).toBe(false);
  });
});

describe('list updates', () => {
  it('upserts keeping the unread count, removes and clears', () => {
    const counted = { ...design, unread: 4 };
    const renamed = upsertChannel([counted], { ...design, name: 'ux', unread: 0 });
    expect(renamed[0]).toMatchObject({ name: 'ux', unread: 4 });
    expect(upsertChannel([general], design)).toHaveLength(2);
    expect(removeChannel([general, design], 'c-design')).toEqual([general]);
    expect(clearUnread([counted], 'c-design')[0].unread).toBe(0);
  });

  it('lets only the creator or a manager change a team channel, never #general or a direct message', () => {
    expect(canManageChannel(design, ANA._id, false)).toBe(true);
    expect(canManageChannel(design, BEN._id, false)).toBe(false);
    expect(canManageChannel(design, BEN._id, true)).toBe(true);
    expect(canManageChannel(general, ANA._id, true)).toBe(false);
    expect(canManageChannel(dmOld, ANA._id, true)).toBe(false);
  });
});

describe('typing', () => {
  it('shows people who typed recently, never yourself, and expires them', () => {
    let map = noteTyping({}, { _id: 'u-ben', name: 'Ben' }, 1000);
    map = noteTyping(map, { _id: 'u-ana', name: 'Ana' }, 1500);
    expect(activeTypers(map, 2000, 'u-ana')).toEqual(['Ben']);
    expect(activeTypers(map, 1000 + TYPING_TTL_MS + 1, 'u-ana')).toEqual([]);
    expect(pruneTyping(map, 2000)).toBe(map);
    expect(Object.keys(pruneTyping(map, 1000 + TYPING_TTL_MS + 1))).toEqual(['u-ana']);
  });
});

describe('socket configuration', () => {
  it('uses the origin of the API, or the page for a relative API URL', () => {
    expect(socketOrigin('http://localhost:5000/api', 'http://localhost:5173')).toBe('http://localhost:5000');
    expect(socketOrigin('https://api.example.com/api', 'https://app.example.com')).toBe('https://api.example.com');
    expect(socketOrigin('/api', 'https://app.example.com')).toBe('https://app.example.com');
  });

  it('polls the open channel faster than the channel list and uses the Vercel path', () => {
    expect(SOCKET_PATH).toBe('/api/socket');
    expect(POLL_INTERVAL_MS).toBeLessThan(CHANNEL_POLL_INTERVAL_MS);
    expect(POLL_INTERVAL_MS).toBe(4000);
  });
});
