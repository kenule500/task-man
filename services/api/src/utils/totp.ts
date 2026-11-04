import crypto from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238 on top of HOTP, RFC 4226) with Node `crypto` only.
 * Parameters match every authenticator app: HMAC-SHA1, 30 second step, 6 digits, base32 secrets.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps accepted on each side of the current one (tolerates clock drift of up to 30 seconds). */
export const TOTP_WINDOW = 1;
export const TOTP_SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding. */
export const base32Encode = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
};

/** Decodes base32 (case-insensitive, spaces, dashes and `=` padding ignored); throws on other characters. */
export const base32Decode = (input: string): Buffer => {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
};

/** A new random shared secret (20 bytes = 160 bits, the size RFC 4226 recommends), base32 encoded. */
export const generateTotpSecret = (): string => base32Encode(crypto.randomBytes(TOTP_SECRET_BYTES));

/** HOTP (RFC 4226 section 5.3): dynamic truncation of HMAC(secret, counter). */
export const hotp = (secret: Buffer, counter: number, digits = TOTP_DIGITS, algorithm = 'sha1'): string => {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac(algorithm, secret).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
};

/** The time step (counter) a moment in time falls into. */
export const stepAt = (timeMs: number): number => Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);

/** The code an authenticator shows at `timeMs`. */
export const generateTotp = (
  secretBase32: string,
  timeMs = Date.now(),
  digits = TOTP_DIGITS,
  algorithm = 'sha1',
): string => hotp(base32Decode(secretBase32), stepAt(timeMs), digits, algorithm);

const safeEqual = (a: string, b: string): boolean =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a submitted code against the steps around `timeMs`. Returns the matching step, or null.
 * Steps at or before `lastUsedStep` are refused, so one code cannot be used twice (replay protection).
 * Every candidate step is compared, so the time taken does not reveal which one matched.
 */
export const verifyTotp = (
  secretBase32: string,
  code: string,
  options: { timeMs?: number; lastUsedStep?: number | null; window?: number } = {},
): number | null => {
  const submitted = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(submitted)) return null;
  const secret = base32Decode(secretBase32);
  const current = stepAt(options.timeMs ?? Date.now());
  const window = options.window ?? TOTP_WINDOW;
  let matched: number | null = null;
  for (let step = current - window; step <= current + window; step++) {
    if (step < 0) continue;
    if (safeEqual(hotp(secret, step), submitted) && matched === null) matched = step;
  }
  if (matched === null) return null;
  if (typeof options.lastUsedStep === 'number' && matched <= options.lastUsedStep) return null;
  return matched;
};

/** `otpauth://totp/...` URL that authenticator apps read from a QR code. */
export const buildOtpauthUrl = (secretBase32: string, account: string, issuer: string): string => {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
};
