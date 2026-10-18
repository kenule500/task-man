import { applyIncomingMessage, sortConversations, unreadLabel } from '../lib/conversations';
import type { ChatMessage, ConversationCard } from '../types';

const card = (overrides: Partial<ConversationCard> & { _id: string }): ConversationCard => ({
  name: overrides._id,
  project: null,
  avatarUrl: null,
  archived: false,
  lastMessage: null,
  unread: false,
  unreadCount: 0,
  ...overrides,
});

const message = (
  channel: string,
  createdAt: string,
  author: ChatMessage['author'] = { _id: 'other', name: 'Ada' },
): ChatMessage => ({
  _id: `m-${channel}-${createdAt}`,
  channel,
  author,
  body: 'hello',
  mentions: [],
  attachments: [],
  replyCount: 0,
  createdAt,
});

describe('conversation ordering and live rows', () => {
  it('AC-062: sorts by the newest message, keeps never-used last, then by name', () => {
    const ordered = sortConversations([
      card({ _id: 'old', lastMessage: { body: 'a', at: '2026-10-01T10:00:00.000Z', authorName: 'A' } }),
      card({ _id: 'never-b' }),
      card({ _id: 'never-a' }),
      card({ _id: 'new', lastMessage: { body: 'b', at: '2026-10-02T10:00:00.000Z', authorName: 'B' } }),
    ]);

    expect(ordered.map(item => item._id)).toEqual(['new', 'old', 'never-a', 'never-b']);
  });

  it('AC-063: patches the row, counts the message and moves it to the top', () => {
    const cards = [
      card({
        _id: 'recent',
        lastMessage: { body: 'first', at: '2026-10-02T10:00:00.000Z', authorName: 'Ada' },
        unreadCount: 1,
      }),
      card({
        _id: 'quiet',
        lastMessage: { body: 'older', at: '2026-10-01T10:00:00.000Z', authorName: 'Bob' },
      }),
    ];

    const next = applyIncomingMessage(cards, message('quiet', '2026-10-03T10:00:00.000Z', { _id: 'bob', name: 'Bob' }));

    expect(next[0]._id).toBe('quiet');
    expect(next[0].lastMessage).toEqual({ body: 'hello', at: '2026-10-03T10:00:00.000Z', authorName: 'Bob' });
    expect(next[0].unread).toBe(true);
    expect(next[0].unreadCount).toBe(1);
    expect(next[1].unreadCount).toBe(1);
  });

  it('AC-063: does not count your own message from another tab as unread', () => {
    const cards = [card({ _id: 'mine', unreadCount: 0 })];
    const next = applyIncomingMessage(cards, message('mine', '2026-10-03T10:00:00.000Z', { _id: 'me', name: 'Me' }), 'me');

    expect(next[0].unreadCount).toBe(0);
    expect(next[0].lastMessage?.authorName).toBe('Me');
  });

  it('AC-063: ignores a message for a conversation that is not listed', () => {
    const cards = [card({ _id: 'known', unreadCount: 0 })];
    const next = applyIncomingMessage(cards, message('unknown', '2026-10-03T10:00:00.000Z'));

    expect(next).toHaveLength(1);
    expect(next[0]._id).toBe('known');
  });

  it('AC-064: caps the unread label at 9+', () => {
    expect(unreadLabel(1)).toBe('1');
    expect(unreadLabel(9)).toBe('9');
    expect(unreadLabel(10)).toBe('9+');
    expect(unreadLabel(240)).toBe('9+');
  });
});
