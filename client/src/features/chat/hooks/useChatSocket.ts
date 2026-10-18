import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/config';
import { getToken } from '@/utils/session';
import type { ChatMessage, OutgoingMessage, Reaction, SocketAck } from '../types';

/** `API_URL` points at the API root (…/api); the socket is served from the same origin. */
const socketOrigin = (apiUrl: string = API_URL): string => apiUrl.replace(/\/api\/?$/, '');

export type TransportState = 'connecting' | 'live' | 'degraded';

export interface ReactionEvent {
  channelId: string;
  messageId: string;
  reactions: Reaction[];
}

interface Options {
  slug: string | undefined;
  channelId: string | undefined;
  /** Every conversation the member can read, so a row still updates when its channel is not open. */
  channelIds?: string[];
  enabled: boolean;
  onMessage: (message: ChatMessage) => void;
  onUpdated: (message: ChatMessage) => void;
  onReaction: (payload: ReactionEvent) => void;
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
 * One connection per workspace. The socket is an accelerator: when it is down every action still
 * works over REST, and `state` lets the UI say so instead of appearing healthy (spec AC-033).
 *
 * The connection subscribes to every conversation the member can read, not only the open one, so a
 * message that arrives in a background row can refresh that row without a reload (spec AC-063).
 */
export const useChatSocket = ({
  slug, channelId, channelIds = [], enabled, onMessage, onUpdated, onReaction, onTyping, onPresence,
}: Options): ChatSocket => {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<TransportState>('connecting');

  // Handlers live in a ref so re-renders never tear down the connection
  const handlers = useRef({ onMessage, onUpdated, onReaction, onTyping, onPresence });
  useEffect(() => {
    handlers.current = { onMessage, onUpdated, onReaction, onTyping, onPresence };
  }, [onMessage, onUpdated, onReaction, onTyping, onPresence]);

  // Refs keep the connection effect independent of the open channel and of the room list
  const openChannel = useRef(channelId);
  useEffect(() => { openChannel.current = channelId; }, [channelId]);
  const rooms = useRef(channelIds);
  useEffect(() => { rooms.current = channelIds; }, [channelIds]);

  const joinRooms = useCallback((socket: Socket) => {
    const ids = new Set<string>();
    for (const id of rooms.current) if (id) ids.add(id);
    if (openChannel.current) ids.add(openChannel.current);
    if (ids.size > 0) socket.emit('chat:join', { channelIds: [...ids] });
  }, []);

  useEffect(() => {
    if (!slug || !enabled) return undefined;

    const socket = io(socketOrigin(), {
      path: '/socket.io',
      transports: ['websocket'],
      auth: callback => callback({ token: getToken() ?? '', workspaceSlug: slug }),
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setState('live');
      joinRooms(socket);
    });
    socket.on('connect_error', () => setState('degraded'));
    socket.on('disconnect', () => setState('degraded'));

    socket.on('chat:message', (message: ChatMessage) => handlers.current.onMessage(message));
    socket.on('chat:updated', (message: ChatMessage) => handlers.current.onUpdated(message));
    socket.on('chat:deleted', (message: ChatMessage) => handlers.current.onUpdated(message));
    socket.on('chat:reaction', (payload: ReactionEvent) => handlers.current.onReaction(payload));
    socket.on('chat:typing', (payload: { channelId?: string; userId: string }) => {
      // Typing is only meaningful for the conversation on screen
      if (payload.channelId === openChannel.current) handlers.current.onTyping(payload.userId);
    });
    socket.on('chat:presence', (payload: { userId: string; online: boolean }) => {
      handlers.current.onPresence(payload.userId, payload.online);
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setState('connecting');
    };
  }, [slug, enabled, joinRooms]);

  // Conversations that arrive after the connection (first load, a new direct message) join then
  const roomKey = channelIds.filter(Boolean).join(',');
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !roomKey) return;
    socket.emit('chat:join', { channelIds: roomKey.split(',') });
  }, [roomKey]);

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
