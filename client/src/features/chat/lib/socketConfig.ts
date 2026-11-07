/** Where the socket server answers (must match the server's SOCKET_PATH and the Vercel function route). */
export const SOCKET_PATH = '/api/socket';

/** While the socket is down the open channel polls the REST history this often. */
export const POLL_INTERVAL_MS = 4000;

/** The channel list (unread badges) refreshes this often while the socket is down. */
export const CHANNEL_POLL_INTERVAL_MS = 20000;

/**
 * Reconnect attempts before the socket gives up and leaves the REST polling in charge. Unbounded
 * retries meant an unreachable server was re-dialled every 15s for as long as the tab stayed open.
 *
 * Spent attempts are not the end of it: `reconnect_failed` schedules one dial after
 * `SLOW_RECONNECT_DELAY_MS`, which resumes the manager's attempts, so a server that was down for the
 * whole fast window is still picked up when it returns instead of the tab polling REST until reload.
 */
export const MAX_RECONNECT_ATTEMPTS = 10;

/** One retry this long after the fast attempts are spent, so a long outage does not mean a dead tab. */
export const SLOW_RECONNECT_DELAY_MS = 60_000;

/** The server origin Socket.IO connects to: the API's origin (a relative API URL means this page's origin). */
export const socketOrigin = (apiUrl: string, pageOrigin: string): string => {
  try {
    return new URL(apiUrl, pageOrigin).origin;
  } catch {
    return pageOrigin;
  }
};
