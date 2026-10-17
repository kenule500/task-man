import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/config';
import { getToken } from '@/utils/session';
import type { LiveChange } from '../types';

/** `API_URL` points at the API root (…/api); the socket is served from the same origin. */
export const socketOrigin = (apiUrl: string = API_URL): string => apiUrl.replace(/\/api\/?$/, '');

export interface ActivityPush {
  change: LiveChange;
  cursor: string;
}

export interface WorkspaceSocketHandlers {
  /** One entry recorded elsewhere in the workspace. */
  onActivity: (push: ActivityPush) => void;
  /** Fired again after a reconnect, so the caller can replay what it missed. */
  onConnected: () => void;
  onDisconnected: () => void;
}

/**
 * Connects to the workspace socket. The token is read on every (re)connect so a refreshed session is
 * picked up, and the connection is refused server-side when the session has been revoked.
 */
export const connectWorkspaceSocket = (slug: string, handlers: WorkspaceSocketHandlers): Socket => {
  const socket = io(socketOrigin(), {
    path: '/socket.io',
    transports: ['websocket'],
    auth: callback => callback({ token: getToken() ?? '', workspaceSlug: slug }),
    reconnection: true,
  });

  socket.on('activity:changed', handlers.onActivity);
  socket.on('connect', handlers.onConnected);
  socket.on('disconnect', handlers.onDisconnected);

  return socket;
};
