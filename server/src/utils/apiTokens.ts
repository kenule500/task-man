import crypto from 'crypto';
import { PERMISSIONS, PermissionKey } from '../config/permissions.js';
import { hashToken } from './tokens.js';

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
  /** SHA-256 hex digest to persist */
  hash: string;
}

export const generateApiToken = (): GeneratedApiToken => {
  const random = randomBase62(API_TOKEN_RANDOM_LENGTH);
  const token = `${API_TOKEN_PREFIX}${random}`;
  return { token, prefix: random.slice(0, API_TOKEN_DISPLAY_LENGTH), hash: hashToken(token) };
};

export const hashApiToken = (token: string): string => hashToken(token);

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
