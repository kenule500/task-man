import crypto from 'crypto';

/**
 * Authenticated encryption for secrets that must be read back later (TOTP shared secrets): AES-256-GCM.
 * The key is derived with HKDF-SHA256 from `TWO_FACTOR_KEY`, falling back to `JWT_SECRET`, and the
 * ciphertext is bound to a context string (the user id), so a value copied to another account fails.
 * Format: `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 */
const VERSION = 'v1';
const KEY_INFO = 'taskman/two-factor/secret-box/v1';
const IV_BYTES = 12;

export const deriveKey = (keyMaterial: string): Buffer =>
  Buffer.from(crypto.hkdfSync('sha256', keyMaterial, 'taskman-secret-box', KEY_INFO, 32));

/** Key material in use: the dedicated key when set, otherwise the JWT secret. */
export const defaultKeyMaterial = (): string => {
  const material = process.env.TWO_FACTOR_KEY || process.env.JWT_SECRET || '';
  if (!material) throw new Error('TWO_FACTOR_KEY or JWT_SECRET is required to protect two-factor secrets');
  return material;
};

export const encryptSecret = (plain: string, context = '', keyMaterial = defaultKeyMaterial()): string => {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(keyMaterial), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
};

/** Throws when the value was tampered with, belongs to another context, or the key changed. */
export const decryptSecret = (box: string, context = '', keyMaterial = defaultKeyMaterial()): string => {
  const [version, iv, tag, data] = box.split('.');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Unsupported secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(keyMaterial), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
};
