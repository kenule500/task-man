import type { ChatChannel, ChatMessage, ChatUser } from '../types';

export const ANA: ChatUser = { _id: 'u-ana', name: 'Ana Lopez', avatarUrl: '' };
export const BEN: ChatUser = { _id: 'u-ben', name: 'Ben Carter', avatarUrl: '' };
export const SAM: ChatUser = { _id: 'u-sam', name: 'Sam Rivera', avatarUrl: '' };

let counter = 0;

/** A message with an id that sorts by creation order. */
export const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => {
  counter += 1;
  const id = String(counter).padStart(24, '0');
  return {
    _id: id,
    channel: 'c-general',
    author: BEN,
    text: `message ${counter}`,
    mentions: [],
    createdAt: new Date(Date.UTC(2026, 2, 1, 10, 0, counter)).toISOString(),
    editedAt: null,
    deleted: false,
    ...overrides,
  };
};

export const makeChannel = (overrides: Partial<ChatChannel> = {}): ChatChannel => ({
  _id: 'c-general',
  workspace: 'w1',
  name: 'general',
  slug: 'general',
  type: 'team',
  project: '',
  private: false,
  isDefault: true,
  createdBy: null,
  lastMessageAt: null,
  memberIds: [],
  members: [],
  unread: 0,
  lastMessage: null,
  ...overrides,
});
