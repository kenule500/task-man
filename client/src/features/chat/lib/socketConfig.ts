/** Where the socket server answers (must match the server's SOCKET_PATH and the Vercel function route). */
export const SOCKET_PATH = '/api/socket/socket.io';

/** While the socket is down the open channel polls the REST history this often. */
export const POLL_INTERVAL_MS = 4000;

/** The channel list (unread badges) refreshes this often while the socket is down. */
export const CHANNEL_POLL_INTERVAL_MS = 20000;

/** The server origin Socket.IO connects to: the API's origin (a relative API URL means this page's origin). */
export const socketOrigin = (apiUrl: string, pageOrigin: string): string => {
  try {
    return new URL(apiUrl, pageOrigin).origin;
  } catch {
    return pageOrigin;
  }
};
