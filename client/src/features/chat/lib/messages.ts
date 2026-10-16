import type { ChatMessage } from '../types';

/** Cursor that precedes every message (polling an empty channel starts here). */
export const EMPTY_CURSOR = `0_${'0'.repeat(24)}`;

/** Same shape the server uses: createdAt in ms and the id as a tiebreak. */
export const cursorOf = (message: Pick<ChatMessage, '_id' | 'createdAt'>): string =>
  `${new Date(message.createdAt).getTime()}_${message._id}`;

export const compareMessages = (a: ChatMessage, b: ChatMessage): number => {
  const byTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (byTime !== 0) return byTime;
  return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
};

/**
 * Adds `incoming` to `current` without ever duplicating: a message with a known id replaces the old copy
 * (an edit), deleted ones are dropped, and the result is ordered oldest first. Sockets, sending and
 * polling can all deliver the same message; this is why the order they arrive in does not matter.
 */
export const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const byId = new Map(current.map(message => [message._id, message]));
  for (const message of incoming) {
    if (message.deleted) byId.delete(message._id);
    else byId.set(message._id, message);
  }
  return [...byId.values()].sort(compareMessages);
};

export const removeMessage = (current: ChatMessage[], id: string): ChatMessage[] =>
  current.some(message => message._id === id) ? current.filter(message => message._id !== id) : current;

/** The newest cursor among messages, or `fallback` when there are none. */
export const newestCursor = (messages: ChatMessage[], fallback: string = EMPTY_CURSOR): string =>
  messages.length === 0 ? fallback : cursorOf(messages[messages.length - 1]);

// ----------------------------------------------------------------
// Grouping for display
// ----------------------------------------------------------------
export interface DayGroup {
  /** Local calendar day, YYYY-MM-DD */
  key: string;
  date: Date;
  messages: ChatMessage[];
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local calendar day of a timestamp as YYYY-MM-DD (a message sent at 23:50 belongs to that evening). */
export const dayKeyOf = (value: string | Date): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const groupByDay = (messages: ChatMessage[]): DayGroup[] => {
  const groups: DayGroup[] = [];
  for (const message of messages) {
    const key = dayKeyOf(message.createdAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.messages.push(message);
    else groups.push({ key, date: new Date(message.createdAt), messages: [message] });
  }
  return groups;
};

export const RUN_GAP_MS = 5 * 60 * 1000;

/** Whether `message` opens a new run (avatar and name shown): another author, a long pause or a new day. */
export const startsRun = (previous: ChatMessage | undefined, message: ChatMessage): boolean => {
  if (!previous) return true;
  if (previous.author._id !== message.author._id) return true;
  if (dayKeyOf(previous.createdAt) !== dayKeyOf(message.createdAt)) return true;
  return new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > RUN_GAP_MS;
};

/**
 * Where the "new messages" divider goes: the first of the `unread` most recent messages by other people.
 * `null` when nothing is unread; the first message when more are unread than are loaded.
 */
export const firstUnreadId = (messages: ChatMessage[], selfId: string, unread: number): string | null => {
  if (unread <= 0) return null;
  const others = messages.filter(message => message.author._id !== selfId);
  if (others.length === 0) return null;
  return others[Math.max(0, others.length - unread)]._id;
};

/** The later of two cursors (a cursor must never move back, or polling would fetch old messages again). */
export const maxCursor = (a: string, b: string): string => {
  const [aTime, aId = ''] = a.split('_');
  const [bTime, bId = ''] = b.split('_');
  const byTime = Number(aTime) - Number(bTime);
  if (byTime !== 0) return byTime > 0 ? a : b;
  return aId >= bId ? a : b;
};
