import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { chatApi } from '../api';
import { patchParentReply, prependOlder, upsertMessage } from '../lib/messages';
import type { ChatMessage, ChatThreadUpdate, Reaction } from '../types';

interface Options {
  slug: string | undefined;
  channelId: string | undefined;
  enabled: boolean;
}

/**
 * The loaded history of one channel, newest page first.
 * Messages arrive oldest-first in the returned array so a thread reads top to bottom.
 */
export const useChatMessages = ({ slug, channelId, enabled }: Options) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const loading = Boolean(channelId) && enabled && loadedFor !== channelId;

  // Paging starts from the newest page; a channel switch loads that channel's history
  useEffect(() => {
    if (!slug || !channelId || !enabled) return undefined;

    let cancelled = false;

    chatApi.messages(slug, channelId)
      .then(page => {
        if (cancelled) return;
        // The API returns newest first; render oldest first
        setMessages([...page.messages].reverse());
        setReactions({});
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
        setError('');
      })
      .catch(err => {
        if (cancelled) return;
        setError(getApiErrorMessage(err, 'Could not load this conversation.'));
      })
      .finally(() => {
        if (!cancelled) setLoadedFor(channelId);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, channelId, enabled]);

  /** Adds a live message, or replaces one that changed (edited or deleted). */
  const applyMessage = useCallback((incoming: ChatMessage) => {
    setMessages(current => {
      // A reply belongs to the thread panel, not the channel list
      if (incoming.parent) return current;
      return upsertMessage(current, incoming);
    });
  }, []);

  const applyUpdated = useCallback((incoming: ChatMessage) => {
    setMessages(current => upsertMessage(current, incoming));
  }, []);

  const applyReaction = useCallback((payload: { messageId: string; reactions: Reaction[] }) => {
    setReactions(current => ({ ...current, [payload.messageId]: payload.reactions }));
  }, []);

  /**
   * A reply that arrived in this channel: the reply itself never joins the channel list, but its
   * parent's count does (AC-115). A parent outside the loaded page is ignored rather than invented.
   */
  const applyThread = useCallback((update: ChatThreadUpdate) => {
    setMessages(current => patchParentReply(current, update));
  }, []);

  const loadOlder = useCallback(async () => {
    if (!slug || !channelId || !cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.messages(slug, channelId, cursor);
      setMessages(current => prependOlder(current, [...page.messages].reverse()));
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load older messages.'));
    } finally {
      setLoadingOlder(false);
    }
  }, [slug, channelId, cursor, loadingOlder]);

  const removeLocal = useCallback((messageId: string) => {
    setMessages(current => current.filter(message => message._id !== messageId));
  }, []);

  const latest = messages[messages.length - 1] ?? null;
  // While another channel's history is loading, its messages must not be shown under the new header
  const visibleMessages = loadedFor === channelId ? messages : [];

  return {
    messages: visibleMessages,
    reactions,
    loading,
    loadingOlder,
    error,
    hasMore,
    latest,
    applyMessage,
    applyUpdated,
    applyReaction,
    applyThread,
    loadOlder,
    removeLocal,
    setReactions,
  };
};
