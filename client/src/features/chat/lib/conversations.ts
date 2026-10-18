import type { ChatMessage, ConversationCard } from '../types';

/** The instant a card's last message arrived, or 0 for a conversation that has never been used. */
const activityOf = (card: ConversationCard): number => (
  card.lastMessage ? Date.parse(card.lastMessage.at) || 0 : 0
);

/**
 * Orders a conversation section by recent activity: newest first, never-used conversations after
 * those with messages and then by name (spec AC-062). The server applies the same rule, so a device
 * that only patches one row locally still shows the list in the same order.
 */
export const sortConversations = (cards: readonly ConversationCard[]): ConversationCard[] =>
  [...cards].sort((a, b) => {
    const at = activityOf(a);
    const bt = activityOf(b);
    if (at !== bt) return bt - at;
    return a.name.localeCompare(b.name);
  });

/**
 * Patches the row for a message that arrived in another conversation: new preview, unread count and
 * position, without re-fetching the list (spec AC-063). A message for a channel that is not in the
 * list is ignored, so a socket joined to several rooms cannot introduce a row the caller cannot see.
 */
export const applyIncomingMessage = (
  cards: readonly ConversationCard[],
  message: ChatMessage,
  currentUserId?: string,
): ConversationCard[] => {
  const index = cards.findIndex(card => card._id === message.channel);
  if (index === -1) return [...cards];

  const current = cards[index];
  const author = typeof message.author === 'string' ? null : message.author;
  // A message the member sent from another tab is activity, but it is already read
  const fromSelf = Boolean(currentUserId && author?._id === currentUserId);
  const next: ConversationCard = {
    ...current,
    lastMessage: {
      body: message.body,
      at: message.createdAt,
      authorName: author?.name ?? current.lastMessage?.authorName ?? '',
    },
    unread: fromSelf ? current.unread : true,
    unreadCount: fromSelf ? current.unreadCount : (current.unreadCount ?? 0) + 1,
  };

  return sortConversations([...cards.slice(0, index), next, ...cards.slice(index + 1)]);
};

/** Badge copy: a four-digit count would widen the row, so it caps at 9+ (spec AC-064). */
export const unreadLabel = (count: number): string => (count > 9 ? '9+' : String(Math.max(count, 1)));
