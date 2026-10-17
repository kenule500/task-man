import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/config';
import { getToken } from '@/utils/session';
import type { ChatMessage, OutgoingMessage, Reaction, SocketAck } from '../types';

/** `API_URL` points at the API root (…/api); the socket is served from the same origin. */
const socketOrigin = (apiUrl: string = API_URL): string => apiUrl.replace(/\/api\/?$/, '');

export type TransportState = 'connecting' | 'live' | 'degraded';

interface Options {
  slug: string | undefined;
  channelId: string | undefined;
  enabled: boolean;
  onMessage: (message: ChatMessage) => void;
  onUpdated: (message: ChatMessage) => void;
  onReaction: (payload: { messageId: string; reactions: Reaction[] }) => void;
  onTyping: (userId: string) => void;
  onPresence: (userId: string, online: boolean) => void;
}

export interface ChatSocket {
  state: TransportState;
  /** Sends over the socket; resolves with `null` when the socket is unavailable so the caller can fall back to REST. */
  send: (input: OutgoingMessage) => Promise<ChatMessage | null>;
  notifyTyping: () => void;
}

/**
 * One connection per open channel. The socket is an accelerator: when it is down every action still
 * works over REST, and `state` lets the UI say so instead of appearing healthy (spec AC-033).
 */
export const useChatSocket = ({
  slug, channelId, enabled, onMessage, onUpdated, onReaction, onTyping, onPresence,
}: Options): ChatSocket => {
  const socketRef = useRef<Socket | null>(null);
  // The transport state belongs to the channel it was observed for, so switching channels never
  // shows the previous channel's status (and no state is set synchronously inside the effect)
  const [connection, setConnection] = useState<{ channelId: string; state: TransportState } | null>(null);
  const state: TransportState = connection && connection.channelId === channelId ? connection.state : 'connecting';

  // Handlers live in a ref so re-renders never tear down the connection
  const handlers = useRef({ onMessage, onUpdated, onReaction, onTyping, onPresence });
    useEffect(() => {
      handlers.current = { onMessage, onUpdated, onReaction, onTyping, onPresence };
    }, [onMessage, onUpdated, onReaction, onTyping, onPresence]);

  useEffect(() => {
    if (!slug || !channelId || !enabled) return undefined;

    const socket = io(socketOrigin(), {
      path: '/socket.io',
      transports: ['websocket'],
      auth: callback => callback({ token: getToken() ?? '', workspaceSlug: slug }),
      reconnection: true,
    });
    socketRef.current = socket;
    const report = (value: TransportState) => setConnection({ channelId, state: value });

    socket.on('connect', () => {
      report('live');
      socket.emit('chat:join', { channelId });
    });
    socket.on('connect_error', () => report('degraded'));
    socket.on('disconnect', () => report('degraded'));

    socket.on('chat:message', (message: ChatMessage) => handlers.current.onMessage(message));
    socket.on('chat:updated', (message: ChatMessage) => handlers.current.onUpdated(message));
    socket.on('chat:deleted', (message: ChatMessage) => handlers.current.onUpdated(message));
    socket.on('chat:reaction', (payload: { messageId: string; reactions: Reaction[] }) => {
      handlers.current.onReaction(payload);
    });
    socket.on('chat:typing', (payload: { userId: string }) => handlers.current.onTyping(payload.userId));
    socket.on('chat:presence', (payload: { userId: string; online: boolean }) => {
      handlers.current.onPresence(payload.userId, payload.online);
    });

    return () => {
      socket.emit('chat:leave', { channelId });
      socket.close();
      socketRef.current = null;
    };
  }, [slug, channelId, enabled]);

  const send = useCallback((input: OutgoingMessage): Promise<ChatMessage | null> => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve(null);
    return new Promise(resolve => {
      socket.emit('chat:send', input, (ack: SocketAck) => resolve(ack?.ok && ack.message ? ack.message : null));
    });
  }, []);

  const notifyTyping = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.connected && channelId) socket.emit('chat:typing', { channelId });
  }, [channelId]);

  return { state, send, notifyTyping };
};
