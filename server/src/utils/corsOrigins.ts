/**
 * Which browser origins may read an API response.
 *
 * The allow-list is exact on purpose: a wildcard would let any site read a workspace. Local development
 * is the one place where an exact list is not enough. Vite moves to the next free port when another
 * project already holds 5173, and the API cannot know which port that will be, so a page opened on
 * 5174 would get no `Access-Control-Allow-Origin` header and the browser would report the response as
 * unreachable (the login form then says "We could not reach the server").
 */

/** Hostnames that name this machine. Anything else, however similar, is a different origin. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** True for `http(s)://localhost|127.0.0.1|[::1]` on any port, and for nothing else. */
export const isLoopbackOrigin = (origin: string): boolean => {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // WHATWG keeps the brackets on an IPv6 hostname; `localhost.evil.example` stays unmatched because
  // the whole hostname is compared, not a suffix of it
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return LOOPBACK_HOSTS.has(host);
};

interface OriginPolicy {
  /**
   * Allow any loopback origin, whatever its port. Development only: production passes the exact
   * `CORS_ORIGIN` list (spec NFR-007, CON-512).
   */
  allowLoopback?: boolean;
}

/**
 * Decides whether a request may receive CORS headers.
 *
 * A missing `Origin` header is not a browser cross-origin request (same-origin navigation, curl, a
 * server-to-server call), so it is left alone. A present one must be on the exact list or, in
 * development, name this machine.
 */
export const isAllowedOrigin = (
  origin: string | undefined,
  allowedOrigins: readonly string[],
  { allowLoopback = false }: OriginPolicy = {},
): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return allowLoopback && isLoopbackOrigin(origin);
};