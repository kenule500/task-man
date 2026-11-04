import crypto from 'crypto';
import { PERMISSIONS, PermissionKey } from '../config/permissions.js';

export const API_TOKEN_PREFIX = 'tm_';
export const API_TOKEN_RANDOM_LENGTH = 40;
// First characters after "tm_", kept in clear so a person can tell their tokens apart
export const API_TOKEN_DISPLAY_LENGTH = 8;
export const MAX_ACTIVE_TOKENS_PER_USER = 10;
export const MAX_TOKEN_NAME = 60;
export const MAX_TOKEN_LIFETIME_DAYS = 365;
// lastUsedAt is written at most this often (not one write per API call)
export const LAST_USED_WRITE_INTERVAL_MS = 60 * 1000;

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TOKEN_FORMAT = new RegExp(`^${API_TOKEN_PREFIX}[0-9A-Za-z]{${API_TOKEN_RANDOM_LENGTH}}$`);

/** Uniform base62 string (bytes above the largest multiple of 62 are discarded: no modulo bias). */
const randomBase62 = (length: number): string => {
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      if (byte < limit && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
};

export interface GeneratedApiToken {
  /** The secret shown once; never stored */
  token: string;
  /** Display prefix, e.g. "aB3dE5fG" */
  prefix: string;
  /** HMAC-SHA256 hex digest to persist */
  hash: string;
}

export const generateApiToken = (): GeneratedApiToken => {
  const random = randomBase62(API_TOKEN_RANDOM_LENGTH);
  const token = `${API_TOKEN_PREFIX}${random}`;
  return { token, prefix: random.slice(0, API_TOKEN_DISPLAY_LENGTH), hash: hashApiToken(token) };
};

/**
 * Server key for token digests: API_TOKEN_PEPPER when set, else the JWT secret (both are validated at boot).
 * Rotating it signs every API token out, like rotating JWT_SECRET signs everyone out.
 */
const tokenKey = (): string => {
  const key = process.env.API_TOKEN_PEPPER || process.env.JWT_SECRET;
  if (!key) throw new Error('JWT_SECRET is required to hash API tokens');
  return key;
};

// PBKDF2 work factor: a few milliseconds per API call, while a leaked digest stays costly to attack offline
const TOKEN_DIGEST_ITERATIONS = 10_000;

/**
 * Deterministic, keyed digest of a token (PBKDF2-SHA256 salted with the server key), so requests can be looked up by
 * digest. Tokens carry 238 bits of randomness; the key means a copy of the database alone cannot test guessed tokens.
 */
export const hashApiToken = (token: string): string =>
  crypto.pbkdf2Sync(token, tokenKey(), TOKEN_DIGEST_ITERATIONS, 32, 'sha256').toString('hex');

/** True when the string looks like one of our tokens (cheap check before touching the database). */
export const isApiTokenFormat = (value: string): boolean => TOKEN_FORMAT.test(value);

export const isPermissionKey = (value: unknown): value is PermissionKey =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PERMISSIONS, value);

/** Every scope is a known permission and the caller holds it too (a token never exceeds its creator). */
export const scopesWithinPermissions = (scopes: readonly string[], permissions: readonly string[]): boolean =>
  scopes.every(scope => isPermissionKey(scope) && permissions.includes(scope));

/** Expiry date for a lifetime in days, or null for a token that does not expire. */
export const expiryFromDays = (days: number | null | undefined, now = new Date()): Date | null =>
  days === null || days === undefined ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

export const isTokenUsable = (token: { revokedAt?: Date | null; expiresAt?: Date | null }, now = new Date()): boolean =>
  !token.revokedAt && (!token.expiresAt || token.expiresAt.getTime() > now.getTime());
