import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/** Recovery codes: `xxxx-xxxx` from a 31-symbol alphabet (no 0/1/i/l/o), about 40 random bits each. */
export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
// bcrypt, although the codes are random: a database copy then still costs real work per guess
const BCRYPT_ROUNDS = 10;

const randomGroup = (): string =>
  Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

export const generateRecoveryCodes = (count = RECOVERY_CODE_COUNT): string[] =>
  Array.from({ length: count }, () => `${randomGroup()}-${randomGroup()}`);

/** Lower-cases and re-inserts the dash, so `ABCD EFGH` and `abcdefgh` match `abcd-efgh`. Null when the shape is wrong. */
export const normalizeRecoveryCode = (input: string): string | null => {
  const compact = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /^[a-z0-9]{8}$/.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4)}` : null;
};

export const hashRecoveryCodes = (codes: string[]): Promise<string[]> =>
  Promise.all(codes.map(code => bcrypt.hash(code, BCRYPT_ROUNDS)));

/** The stored hash that matches `code`, or null. Compares every hash so timing does not reveal the position. */
export const findRecoveryCodeHash = async (code: string, hashes: string[]): Promise<string | null> => {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return null;
  const results = await Promise.all(hashes.map(async hash => ((await bcrypt.compare(normalized, hash)) ? hash : null)));
  return results.find((hash): hash is string => hash !== null) ?? null;
};
