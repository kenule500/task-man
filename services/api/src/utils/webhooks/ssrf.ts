import dns from 'dns';
import net from 'net';

// Server-side request forgery guard for outbound webhooks. In production a webhook may only reach public
// internet hosts; in development and tests plain http and local servers are allowed so receivers can be tried out.

export const MAX_WEBHOOK_URL_LENGTH = 2000;
const PRODUCTION_PORTS = new Set([80, 443]);
const DEVELOPMENT_PORTS = new Set([80, 443, 8080, 3000]);

export interface GuardOptions {
  /** Apply the strict (production) rules. Defaults to NODE_ENV === 'production'. */
  production?: boolean;
}

export type LookupFn = (hostname: string) => Promise<{ address: string; family: number }[]>;

const isProduction = (options?: GuardOptions): boolean => options?.production ?? process.env.NODE_ENV === 'production';

const defaultLookup: LookupFn = hostname => dns.promises.lookup(hostname, { all: true, verbatim: true });

// ---------------------------------------------------------------
// Address classification
// ---------------------------------------------------------------
const parseIPv4 = (address: string): number[] | null => {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map(part => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return numbers.some(n => Number.isNaN(n) || n > 255) ? null : numbers;
};

const isBlockedIPv4 = ([a, b, c]: number[]): boolean =>
  a === 0 ||                                  // "this network"
  a === 10 ||                                 // private
  (a === 100 && b >= 64 && b <= 127) ||       // CGNAT
  a === 127 ||                                // loopback
  (a === 169 && b === 254) ||                 // link-local, cloud metadata
  (a === 172 && b >= 16 && b <= 31) ||        // private
  (a === 192 && b === 0 && c === 0) ||        // IETF protocol assignments
  (a === 192 && b === 0 && c === 2) ||        // documentation
  (a === 192 && b === 168) ||                 // private
  (a === 198 && (b === 18 || b === 19)) ||    // benchmarking
  (a === 198 && b === 51 && c === 100) ||     // documentation
  (a === 203 && b === 0 && c === 113) ||      // documentation
  a >= 224;                                   // multicast, reserved, broadcast

/** Expands an IPv6 literal to eight 16-bit groups (handles "::" and an embedded dotted IPv4 tail). */
const parseIPv6 = (input: string): number[] | null => {
  let address = input.toLowerCase().split('%')[0];
  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    address = `${address.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const numbers = groups.map(group => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN));
  return numbers.length === 8 && !numbers.some(Number.isNaN) ? numbers : null;
};

const isBlockedIPv6 = (g: number[]): boolean => {
  const embeddedV4 = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
  const leadingZeros = g.slice(0, 5).every(group => group === 0);
  if (leadingZeros && g[5] === 0) return true;                           // ::, ::1 and IPv4-compatible ::a.b.c.d
  if (leadingZeros && g[5] === 0xffff) return isBlockedIPv4(embeddedV4); // IPv4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(group => group === 0)) return isBlockedIPv4(embeddedV4); // NAT64
  if (g[0] === 0x2002) return isBlockedIPv4([g[1] >> 8, g[1] & 255, g[2] >> 8]); // 6to4
  return (
    (g[0] & 0xfe00) === 0xfc00 ||              // unique local fc00::/7
    (g[0] & 0xffc0) === 0xfe80 ||              // link-local fe80::/10
    (g[0] & 0xffc0) === 0xfec0 ||              // deprecated site-local
    (g[0] & 0xff00) === 0xff00 ||              // multicast
    (g[0] === 0x2001 && g[1] === 0x0db8) ||    // documentation
    (g[0] === 0x2001 && g[1] === 0)            // Teredo
  );
};

/** True for loopback, private, link-local, CGNAT, multicast, reserved and unique-local addresses. Unparseable input counts as blocked. */
export const isBlockedAddress = (address: string): boolean => {
  const clean = address.replace(/^\[|\]$/g, '');
  if (net.isIPv4(clean)) {
    const parts = parseIPv4(clean);
    return !parts || isBlockedIPv4(parts);
  }
  if (net.isIPv6(clean)) {
    const groups = parseIPv6(clean);
    return !groups || isBlockedIPv6(groups);
  }
  return true;
};

// ---------------------------------------------------------------
// URL rules
// ---------------------------------------------------------------
export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Syntax rules that need no network: scheme, credentials, port, blocked IP literals. */
export const checkWebhookUrl = (raw: unknown, options?: GuardOptions): UrlCheck => {
  const production = isProduction(options);
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_WEBHOOK_URL_LENGTH) {
    return { ok: false, reason: 'Enter a valid URL' };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'Enter a valid URL' };
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !production)) {
    return { ok: false, reason: production ? 'The URL must start with https://' : 'The URL must start with https:// or http://' };
  }
  if (url.username || url.password) return { ok: false, reason: 'The URL cannot contain a username or password' };

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  // Outside production any port is fine for a local test receiver
  const localTestReceiver = !production && LOCAL_HOSTS.has(url.hostname);
  if (!localTestReceiver && !(production ? PRODUCTION_PORTS : DEVELOPMENT_PORTS).has(port)) {
    return { ok: false, reason: production ? 'Only ports 80 and 443 are allowed' : 'Only ports 80, 443, 8080 and 3000 are allowed' };
  }
  if (production && net.isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0 && isBlockedAddress(url.hostname)) {
    return { ok: false, reason: 'This address is not reachable from the internet' };
  }
  if (production && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.internal'))) {
    return { ok: false, reason: 'This host name is not allowed' };
  }
  return { ok: true, url };
};

/**
 * Resolves the host and returns its addresses, refusing hosts that resolve to non-public addresses in production.
 * Also used as the socket `lookup`, so the checked address is the one that is connected to (no DNS rebinding gap).
 */
export const resolvePublicAddresses = async (
  hostname: string,
  options?: GuardOptions & { lookup?: LookupFn },
): Promise<{ address: string; family: number }[]> => {
  const production = isProduction(options);
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) !== 0
    ? [{ address: host, family: net.isIP(host) }]
    : await (options?.lookup ?? defaultLookup)(host);
  if (addresses.length === 0) throw new Error('The host name does not resolve');
  if (production && addresses.some(item => isBlockedAddress(item.address))) {
    throw new Error('This host resolves to a private or reserved address');
  }
  return addresses;
};

/** Full check used when saving a webhook: syntax rules plus DNS resolution. Returns an error message, or null when allowed. */
export const validateWebhookTarget = async (
  raw: unknown,
  options?: GuardOptions & { lookup?: LookupFn },
): Promise<string | null> => {
  const checked = checkWebhookUrl(raw, options);
  if (!checked.ok) return checked.reason;
  // Development and tests may use names that only resolve on the developer's machine, so DNS is checked in production only
  if (!isProduction(options)) return null;
  try {
    await resolvePublicAddresses(checked.url.hostname, options);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};
