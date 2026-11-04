import crypto from 'crypto';

/**
 * One-way hash for tokens stored in the database (email verification,
 * password reset, sessions). A leaked database then cannot be replayed:
 * only the user holds the raw token.
 */
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/** Random URL-safe token plus the hash to persist. */
export const createSecureToken = (): { token: string; hash: string } => {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
};

/** Reads `Bearer <token>` from an Authorization header. */
export const getBearerToken = (header: string | undefined): string | null => {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};
