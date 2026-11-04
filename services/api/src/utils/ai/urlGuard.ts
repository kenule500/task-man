import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { normalizeBaseURL, type AiConfigProblem } from './providers.js';

// SSRF and DNS-rebinding guard for custom AI endpoints. The URL is validated, every DNS answer is
// checked, and the chosen address is pinned by the model client (see pinnedFetch.ts). Pure except
// for the DNS lookup, so it can be unit tested with a mocked resolver.

export type EndpointProblem = Extract<AiConfigProblem, 'BASE_URL_INVALID' | 'BASE_URL_PRIVATE' | 'BASE_URL_UNRESOLVED'>;

export class UnsafeEndpointError extends Error {
  constructor(readonly code: EndpointProblem) {
    super(code === 'BASE_URL_INVALID'
      ? 'The AI endpoint must be a valid HTTPS URL without credentials, query or fragment.'
      : code === 'BASE_URL_PRIVATE'
        ? 'The AI endpoint resolves to a private or reserved network address.'
        : 'The AI endpoint host could not be resolved.');
    this.name = 'UnsafeEndpointError';
  }
}

export interface SafeEndpoint {
  url: URL;
  /** A public address selected at validation time; the client pins it for every request. */
  address: string;
  family: number;
}

export const ipv4ToInt = (value: string): number | null => {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = ((result << 8) | octet) >>> 0;
  }
  return result;
};

const IPV4_BLOCKS: readonly [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const inIpv4Block = (address: number, base: number, prefix: number): boolean => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
};

const isPrivateIpv4 = (value: string): boolean => {
  const address = ipv4ToInt(value);
  if (address === null) return true;
  return IPV4_BLOCKS.some(([base, prefix]) => {
    const block = ipv4ToInt(base);
    return block !== null && inIpv4Block(address, block, prefix);
  });
};

const mappedIpv4 = (value: string): string | null => {
  const dotted = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];
  const hex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
};

export const isPrivateAddress = (value: string): boolean => {
  const address = value.split('%')[0].toLowerCase();
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family !== 6) return true;

  const mapped = mappedIpv4(address);
  if (mapped) return isPrivateIpv4(mapped);
  if (address === '::' || address === '::1') return true;
  if (/^f[cd]/.test(address)) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(address)) return true; // fe80::/10 link local
  if (/^ff/.test(address)) return true; // multicast
  if (/^2001:0?db8(?::|$)/.test(address)) return true; // documentation
  if (/^2001:(?:2|10|20)(?::|$)/.test(address)) return true; // benchmarking and ORCHID
  if (/^2001:0{3,4}:/.test(address)) return true; // Teredo
  if (/^2002(?::|$)/.test(address)) return true; // 6to4 can embed a private IPv4
  if (/^3fff(?::|$)/.test(address)) return true; // documentation (RFC 9637)
  if (/^64:ff9b(?::|$)/.test(address)) return true; // NAT64
  return false;
};

/** Hosts that some resolvers interpret as an integer or octal IPv4 address. */
const ambiguousHost = (hostname: string): boolean => {
  if (/^\d+$/.test(hostname)) return true;
  if (/^0x[0-9a-f]+$/i.test(hostname)) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split('.').some(part => part.length > 1 && part.startsWith('0'));
  }
  return false;
};

/** Validates the URL, resolves it once, and refuses private, reserved, malformed or unresolvable hosts. */
export const resolveSafeEndpoint = async (baseURL: string): Promise<SafeEndpoint> => {
  const normalized = normalizeBaseURL(baseURL);
  if (!normalized) throw new UnsafeEndpointError('BASE_URL_INVALID');
  const url = new URL(normalized);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (ambiguousHost(hostname)) throw new UnsafeEndpointError('BASE_URL_INVALID');

  const literal = net.isIP(hostname);
  let answers: { address: string; family: number }[];
  if (literal) {
    answers = [{ address: hostname, family: literal }];
  } else {
    try {
      answers = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new UnsafeEndpointError('BASE_URL_UNRESOLVED');
    }
  }
  if (answers.length === 0) throw new UnsafeEndpointError('BASE_URL_UNRESOLVED');
  if (answers.some(answer => isPrivateAddress(answer.address))) throw new UnsafeEndpointError('BASE_URL_PRIVATE');

  return { url, address: answers[0].address, family: answers[0].family };
};
