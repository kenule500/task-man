import type { ChannelSummary, ChatMessage, ConversationCard } from '../types';

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

/**
 * A project channel the member was just granted, arriving over the socket (FR-077, AC-080).
 *
 * Applied as a functional update against whatever the list holds *now*, so a burst of grants cannot
 * drop a row: dedupe by id, then re-sort so the segment keeps its order. A channel already in the
 * list is refreshed rather than duplicated, which is what an offline member's next load produces
 * anyway (EC-031, EC-032).
 */
export const grantChannel = (
  cards: readonly ConversationCard[],
  card: ConversationCard,
): ConversationCard[] => {
  if (!card?._id) return [...cards];
  const existing = cards.find(item => item._id === card._id);
  if (!existing) return sortConversations([...cards, card]);

  // Known channel: keep its preview and unread state, take the fresher identity fields
  const merged: ConversationCard = {
    ...existing,
    name: card.name || existing.name,
    project: card.project ?? existing.project,
    avatarUrl: card.avatarUrl ?? existing.avatarUrl,
    archived: card.archived,
  };
  return sortConversations([
    ...cards.filter(item => item._id !== card._id),
    merged,
  ]);
};

/**
 * Applies a channel summary to a row already in the list, so a project rename shows without a reload
 * (FR-079, EC-042). An unknown channel is left alone: it is not this list's business to invent rows.
 */
export const renameChannel = (
  cards: readonly ConversationCard[],
  summary: ChannelSummary,
): ConversationCard[] => {
  if (!summary?._id) return [...cards];
  let changed = false;
  const next = cards.map(card => {
    if (card._id !== summary._id) return card;
    changed = true;
    return {
      ...card,
      name: summary.name || card.name,
      avatarUrl: summary.avatarUrl ?? card.avatarUrl,
      archived: summary.archived ?? card.archived,
    };
  });
  return changed ? next : [...cards];
};
