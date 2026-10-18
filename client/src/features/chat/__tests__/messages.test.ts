import {
  channelLabel, defaultChannelId, groupByDay, prependOlder, sortChannels, unreadCount, upsertMessage,
} from '../lib/messages';
import type { ChatChannel, ChatMessage } from '../types';

const channel = (overrides: Partial<ChatChannel> & { _id: string; kind: ChatChannel['kind']; name: string }): ChatChannel => ({
  description: '',
  participants: [],
  archived: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const message = (id: string, createdAt: string): ChatMessage => ({
  _id: id,
  channel: 'c1',
  author: 'u1',
  body: id,
  mentions: [],
  attachments: [],
  replyCount: 0,
  createdAt,
});

describe('chat message helpers', () => {
  it('AC-011: paging prepends older messages without duplicates and keeps order', () => {
    const current = [message('m3', '2026-10-03T00:00:00.000Z'), message('m4', '2026-10-04T00:00:00.000Z')];
    const older = [message('m1', '2026-10-01T00:00:00.000Z'), message('m2', '2026-10-02T00:00:00.000Z'), message('m4', '2026-10-04T00:00:00.000Z')];

    const next = prependOlder(current, older);
    expect(next.map(item => item._id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('AC-007: a live message replaces its row or appends once', () => {
    const existing = [message('m1', '2026-10-01T00:00:00.000Z')];
    const edited = { ...existing[0], body: 'edited' };

    expect(upsertMessage(existing, edited)).toEqual([edited]);
    expect(upsertMessage(existing, message('m2', '2026-10-02T00:00:00.000Z')).map(item => item._id))
      .toEqual(['m1', 'm2']);
  });

  it('AC-010: groups messages by calendar day in arrival order', () => {
    const now = new Date('2026-10-18T12:00:00.000Z');
    const groups = groupByDay([
      message('m1', '2026-10-18T08:00:00.000Z'),
      message('m2', '2026-10-18T09:00:00.000Z'),
      message('m3', '2026-10-17T09:00:00.000Z'),
      message('m4', '2026-10-10T09:00:00.000Z'),
    ], now);

    expect(groups.map(group => group.key)).toEqual(['2026-10-18', '2026-10-17', '2026-10-10']);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].messages.map(item => item._id)).toEqual(['m1', 'm2']);
    expect(groups[1].label).toBe('Yesterday');
    expect(groups[2].messages).toHaveLength(1);
  });

  it('AC-001: orders channels team, general, project, then direct, then by name', () => {
    const ordered = sortChannels([
      channel({ _id: 'd', kind: 'direct', name: 'Zed' }),
      channel({ _id: 'p', kind: 'project', name: 'Project One' }),
      channel({ _id: 'g', kind: 'general', name: 'General' }),
      channel({ _id: 't', kind: 'team', name: 'Team Chat' }),
    ]);

    expect(ordered.map(item => item._id)).toEqual(['t', 'g', 'p', 'd']);
  });

  it('AC-011: the default channel is the first readable, non-archived one', () => {
    const channels = [
      channel({ _id: 'archived', kind: 'team', name: 'Team Chat', archived: true }),
      channel({ _id: 'general', kind: 'general', name: 'General' }),
    ];

    expect(defaultChannelId(channels)).toBe('general');
  });

  it('AC-023: a channel is unread when it has activity after the last visit', () => {
    const team = channel({
      _id: 'c1', kind: 'team', name: 'Team Chat', lastMessageAt: '2026-10-18T10:00:00.000Z',
    });

    expect(unreadCount(team, {})).toBe(1);
    expect(unreadCount(team, { c1: '2026-10-18T11:00:00.000Z' })).toBe(0);
    expect(unreadCount(team, { c1: '2026-10-18T09:00:00.000Z' })).toBe(1);
    expect(unreadCount(channel({ _id: 'c2', kind: 'general', name: 'General' }), {})).toBe(0);
  });

  it('AC-061: names a direct conversation after the other participant', () => {
    const direct = channel({ _id: 'c1', kind: 'direct', name: 'Direct message', participants: ['me', 'other'] });

    expect(channelLabel(direct, 'me', id => (id === 'other' ? 'Ada' : 'Me'))).toBe('Ada');
    expect(channelLabel({ ...direct, participants: ['me'] }, 'me', () => 'Ada')).toBe('Direct message');
  });
});
