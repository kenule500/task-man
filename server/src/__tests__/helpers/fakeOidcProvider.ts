// A local OpenID Connect provider for tests: an RSA key pair, a JWKS and a signer. No network.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export interface FakeKey {
  kid: string;
  privateKey: crypto.KeyObject;
  publicJwk: Record<string, unknown>;
}

export const createFakeKey = (kid = 'test-key-1'): FakeKey => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };
  return { kid, privateKey, publicJwk };
};

export const jwksOf = (...keys: FakeKey[]) => ({ keys: keys.map(key => key.publicJwk) });

/** Signs claims like an identity provider would (RS256 with a `kid`). */
export const signIdToken = (key: FakeKey, claims: Record<string, unknown>, options: { kid?: string } = {}): string =>
  jwt.sign(claims, key.privateKey, { algorithm: 'RS256', keyid: options.kid ?? key.kid });

/** `iat` and `exp` around `nowMs`, plus the given claims (an `undefined` value removes the claim). */
export const baseClaims = (nowMs: number, claims: Record<string, unknown>): Record<string, unknown> => {
  const now = Math.floor(nowMs / 1000);
  return Object.fromEntries(Object.entries({ iat: now - 5, exp: now + 3600, ...claims }).filter(([, value]) => value !== undefined));
};
