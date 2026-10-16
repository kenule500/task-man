import { useCallback, useEffect, useRef, useState } from 'react';
import { chatClient } from '../lib/chatClient';
import { activeTypers, noteTyping, pruneTyping, TYPING_TTL_MS, type TypingMap } from '../lib/typing';
import type { TypingEvent } from '../types';

const SEND_INTERVAL_MS = 2000;

/** Who is typing in a channel right now, and a function to announce that this person is typing. */
export const useTyping = (channelId: string, selfId: string): { typers: string[]; announce: () => void } => {
  const [map, setMap] = useState<{ channelId: string; entries: TypingMap }>({ channelId, entries: {} });
  const [now, setNow] = useState(() => Date.now());
  const lastSent = useRef(0);

  useEffect(() => {
    return chatClient.on<TypingEvent>('chat:typing', event => {
      if (event.channelId !== channelId) return;
      const at = Date.now();
      setNow(at);
      // Entries of another channel are dropped, so a new channel starts with nobody typing
      setMap(current => ({ channelId, entries: noteTyping(current.channelId === channelId ? current.entries : {}, event.user, at) }));
    });
  }, [channelId]);

  // Entries expire on a timer, since silence produces no event
  useEffect(() => {
    if (Object.keys(map.entries).length === 0) return undefined;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      setMap(current => {
        const entries = pruneTyping(current.entries, at);
        return entries === current.entries ? current : { ...current, entries };
      });
    }, TYPING_TTL_MS / 2);
    return () => window.clearInterval(timer);
  }, [map.entries]);

  const announce = useCallback(() => {
    const at = Date.now();
    if (at - lastSent.current < SEND_INTERVAL_MS) return;
    lastSent.current = at;
    chatClient.typing(channelId);
  }, [channelId]);

  return { typers: map.channelId === channelId ? activeTypers(map.entries, now, selfId) : [], announce };
};
