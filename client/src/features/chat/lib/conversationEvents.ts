/**
 * One-way notices from the open chat screen to the sidebar.
 *
 * The sidebar needs to learn that a conversation was granted, renamed or just read, but it must not
 * open a second socket: the chat screen owns the connection (one per workspace) and simply dispatches
 * one of these events. `channels` asks the sidebar to re-read its list; `read` only asks it to repaint
 * from the read state it already holds, so opening a conversation costs no request (NFR-045, AC-113).
 */
export type ChatConversationEvent = 'channels' | 'read';

const EVENT_NAME = 'chat:conversations';

/** Announces that the set of conversations changed (grant, rename) or that one was read. */
export const notifyConversations = (kind: ChatConversationEvent = 'channels'): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ChatConversationEvent>(EVENT_NAME, { detail: kind }));
};

/** Subscribes to those notices; returns the unsubscribe function for the caller's cleanup. */
export const onConversations = (listener: (kind: ChatConversationEvent) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<ChatConversationEvent>).detail;
    listener(detail === 'read' ? 'read' : 'channels');
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
