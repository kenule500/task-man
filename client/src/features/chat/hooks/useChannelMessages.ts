import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { chatApi } from '../api';
import { chatClient } from '../lib/chatClient';
import { EMPTY_CURSOR, cursorOf, maxCursor, mergeMessages, removeMessage } from '../lib/messages';
import { POLL_INTERVAL_MS } from '../lib/socketConfig';
import type { ChatMessage, ConnectionStatus } from '../types';
import { useChatState } from './useChatSocket';

const PAGE = 50;
const SYNC_PAGES = 5;
const READ_DELAY_MS = 500;

export interface ChannelMessages {
  messages: ChatMessage[];
  status: 'loading' | 'ready' | 'error';
  error: string;
  /** Older messages exist */
  hasMore: boolean;
  loadingOlder: boolean;
  connection: ConnectionStatus;
  /** Text for a polite live region: the latest message from someone else */
  announcement: string;
  loadOlder: () => Promise<void>;
  retry: () => void;
  send: (text: string) => Promise<ChatMessage>;
  edit: (id: string, text: string) => Promise<ChatMessage>;
  remove: (id: string) => Promise<void>;
}

/**
 * Messages of one channel. Mount it with `key={channelId}` so every channel starts clean.
 *
 * New messages arrive over the socket; while it is not connected the hook polls the REST history every few
 * seconds (`after` the newest cursor, plus edits and deletions since the last poll), and it catches up once
 * more when the socket comes back. Everything goes through `mergeMessages`, so a message that arrives
 * twice (socket echo, poll, the sender's own response) is shown once.
 */
export const useChannelMessages = (slug: string, channelId: string, selfId: string): ChannelMessages => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [attempt, setAttempt] = useState(0);
  const { status: connection } = useChatState();

  const messagesRef = useRef<ChatMessage[]>([]);
  const cursorRef = useRef(EMPTY_CURSOR);
  const syncedAtRef = useRef(new Date().toISOString());
  const syncingRef = useRef(false);
  const readyRef = useRef(false);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    if (next.length > 0) cursorRef.current = maxCursor(cursorRef.current, cursorOf(next[next.length - 1]));
    setMessages(next);
  }, []);

  const scheduleRead = useCallback(() => {
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      if (document.visibilityState === 'visible') void chatClient.markRead(channelId);
    }, READ_DELAY_MS);
  }, [channelId]);

  // First page
  useEffect(() => {
    let cancelled = false;
    chatApi.messages(slug, channelId, { limit: PAGE })
      .then(page => {
        if (cancelled) return;
        commit(mergeMessages([], page.messages));
        cursorRef.current = maxCursor(EMPTY_CURSOR, page.cursor);
        syncedAtRef.current = page.serverTime;
        readyRef.current = true;
        setHasMore(page.hasMore);
        setError('');
        setStatus('ready');
        scheduleRead();
      })
      .catch(err => {
        if (cancelled) return;
        setError(getApiErrorMessage(err, 'error'));
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [slug, channelId, attempt, commit, scheduleRead]);

  // Live room membership and the unread rule for the open channel
  useEffect(() => {
    chatClient.join(channelId);
    chatClient.setActive(channelId);
    return () => {
      chatClient.leave(channelId);
      chatClient.setActive(null);
      if (readTimer.current) clearTimeout(readTimer.current);
    };
  }, [channelId]);

  // Fetch what is newer than the cursor, and edits/deletions since the last sync
  const sync = useCallback(async () => {
    if (syncingRef.current || !readyRef.current) return;
    syncingRef.current = true;
    try {
      for (let page = 0; page < SYNC_PAGES; page += 1) {
        const result = await chatApi.messages(slug, channelId, {
          after: cursorRef.current, changedSince: syncedAtRef.current, limit: 100,
        });
        const incoming = [...result.messages, ...(result.changes ?? [])];
        const fresh = result.messages.some(message => message.author._id !== selfId);
        if (incoming.length > 0) commit(mergeMessages(messagesRef.current, incoming));
        cursorRef.current = maxCursor(cursorRef.current, result.cursor);
        syncedAtRef.current = result.serverTime;
        if (fresh) scheduleRead();
        if (!result.hasMore) break;
      }
    } catch {
      // The next tick tries again
    } finally {
      syncingRef.current = false;
    }
  }, [slug, channelId, selfId, commit, scheduleRead]);

  // Socket events
  useEffect(() => {
    const offMessage = chatClient.on<ChatMessage>('chat:message', message => {
      if (message.channel !== channelId) return;
      commit(mergeMessages(messagesRef.current, [message]));
      if (message.author._id !== selfId) {
        setAnnouncement(`${message.author.name}: ${message.text}`.slice(0, 160));
        scheduleRead();
      }
    });
    const offUpdate = chatClient.on<ChatMessage>('chat:message_updated', message => {
      if (message.channel === channelId) commit(mergeMessages(messagesRef.current, [message]));
    });
    const offDelete = chatClient.on<{ _id: string; channel: string }>('chat:message_deleted', event => {
      if (event.channel === channelId) commit(removeMessage(messagesRef.current, event._id));
    });
    // The socket came back: anything posted while it was down is fetched once
    const offReconnect = chatClient.on<undefined>('chat:reconnected', () => { void sync(); });
    return () => { offMessage(); offUpdate(); offDelete(); offReconnect(); };
  }, [channelId, selfId, commit, scheduleRead, sync]);

  // Fallback: poll while the socket is not connected
  useEffect(() => {
    if (status !== 'ready' || connection === 'connected') return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sync();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [status, connection, sync]);

  // Coming back to the tab: catch up and mark read
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void sync();
      scheduleRead();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [sync, scheduleRead]);

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.messages(slug, channelId, { before: cursorOf(oldest), limit: PAGE });
      commit(mergeMessages(messagesRef.current, page.messages));
      setHasMore(page.hasMore);
    } catch (err) {
      setError(getApiErrorMessage(err, 'error'));
    } finally {
      setLoadingOlder(false);
    }
  }, [slug, channelId, loadingOlder, commit]);

  const send = useCallback(async (text: string) => {
    const message = await chatApi.send(slug, channelId, text);
    commit(mergeMessages(messagesRef.current, [message]));
    chatClient.noteOwnMessage(channelId, message);
    return message;
  }, [slug, channelId, commit]);

  const edit = useCallback(async (id: string, text: string) => {
    const message = await chatApi.edit(slug, id, text);
    commit(mergeMessages(messagesRef.current, [message]));
    return message;
  }, [slug, commit]);

  const remove = useCallback(async (id: string) => {
    await chatApi.remove(slug, id);
    commit(removeMessage(messagesRef.current, id));
  }, [slug, commit]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt(value => value + 1);
  }, []);

  return { messages, status, error, hasMore, loadingOlder, connection, announcement, loadOlder, retry, send, edit, remove };
};
