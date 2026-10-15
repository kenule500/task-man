// OpenID Connect relying party (authorization code + PKCE) with Node built-ins and jsonwebtoken.
// Network access goes through an injectable `fetch`, so tests run against a fake provider.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { SsoProviderConfig } from '../config/sso.js';
import { MULTI_TENANT_VALUES } from '../config/sso.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OidcDeps {
  fetch: FetchLike;
  /** Milliseconds since the epoch */
  now: () => number;
}

export const defaultDeps = (): OidcDeps => ({
  // Looked up on every call, so a replaced global fetch (tests) is honoured
  fetch: (input, init) => globalThis.fetch(input, init),
  now: () => Date.now(),
});

export type OidcErrorCode =
  | 'discovery_failed'
  | 'jwks_failed'
  | 'token_exchange_failed'
  | 'invalid_token'
  | 'tenant_not_allowed';

export class OidcError extends Error {
  readonly code: OidcErrorCode;
  constructor(code: OidcErrorCode, message: string) {
    super(message);
    this.name = 'OidcError';
    this.code = code;
  }
}

export const DISCOVERY_TTL_MS = 60 * 60 * 1000;
export const JWKS_TTL_MS = 60 * 60 * 1000;
/** An unknown `kid` triggers at most one refetch per minute, so garbage tokens cannot make us hammer the provider */
export const JWKS_REFETCH_MIN_MS = 60 * 1000;
export const CLOCK_SKEW_SECONDS = 2 * 60;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 512 * 1024;

/** Personal Microsoft accounts (outlook.com, hotmail.com, ...) sign in through this fixed tenant. */
export const MICROSOFT_PERSONAL_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------
// HTTP helpers
// ------------------------------------------------------------
const assertHttps = (value: unknown, what: string, code: OidcErrorCode): string => {
  if (typeof value !== 'string') throw new OidcError(code, `${what} is missing`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OidcError(code, `${what} is not a URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new OidcError(code, `${what} must be https`);
  return value;
};

const readJson = async (response: Response, code: OidcErrorCode): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (text.length > MAX_BODY_CHARS) throw new OidcError(code, 'response too large');
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new OidcError(code, 'response is not a JSON object');
};

// ------------------------------------------------------------
// Discovery (cached for an hour)
// ------------------------------------------------------------
export interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

const discoveryCache = new Map<string, { doc: DiscoveryDocument; expiresAt: number }>();

export const getDiscovery = async (discoveryUrl: string, deps: OidcDeps = defaultDeps()): Promise<DiscoveryDocument> => {
  const cached = discoveryCache.get(discoveryUrl);
  if (cached && cached.expiresAt > deps.now()) return cached.doc;

  assertHttps(discoveryUrl, 'discovery URL', 'discovery_failed');
  let raw: Record<string, unknown>;
  try {
    const response = await deps.fetch(discoveryUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new OidcError('discovery_failed', `discovery answered ${response.status}`);
    raw = await readJson(response, 'discovery_failed');
  } catch (error) {
    throw error instanceof OidcError ? error : new OidcError('discovery_failed', 'discovery request failed');
  }

  if (typeof raw.issuer !== 'string' || !raw.issuer) throw new OidcError('discovery_failed', 'issuer is missing');
  const doc: DiscoveryDocument = {
    issuer: raw.issuer,
    authorization_endpoint: assertHttps(raw.authorization_endpoint, 'authorization endpoint', 'discovery_failed'),
    token_endpoint: assertHttps(raw.token_endpoint, 'token endpoint', 'discovery_failed'),
    jwks_uri: assertHttps(raw.jwks_uri, 'jwks uri', 'discovery_failed'),
  };
  discoveryCache.set(discoveryUrl, { doc, expiresAt: deps.now() + DISCOVERY_TTL_MS });
  return doc;
};

// ------------------------------------------------------------
// Signing keys (JWKS)
// ------------------------------------------------------------
interface Jwk {
  kty?: unknown;
  kid?: unknown;
  n?: unknown;
  e?: unknown;
  use?: unknown;
}

const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

const fetchJwks = async (jwksUri: string, deps: OidcDeps): Promise<Jwk[]> => {
  try {
    const response = await deps.fetch(jwksUri, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new OidcError('jwks_failed', `jwks answered ${response.status}`);
    const body = await readJson(response, 'jwks_failed');
    if (!Array.isArray(body.keys)) throw new OidcError('jwks_failed', 'jwks has no keys');
    const keys = (body.keys as unknown[]).filter((key): key is Jwk => Boolean(key) && typeof key === 'object');
    jwksCache.set(jwksUri, { keys, fetchedAt: deps.now() });
    return keys;
  } catch (error) {
    throw error instanceof OidcError ? error : new OidcError('jwks_failed', 'jwks request failed');
  }
};

const findKey = (keys: Jwk[], kid: string): Jwk | undefined =>
  keys.find(key => key.kid === kid && key.kty === 'RSA' && (key.use === undefined || key.use === 'sig'));

/** The RSA public key with this `kid`; an unknown `kid` refetches the set (rate limited), a known one comes from the cache. */
export const getSigningKey = async (jwksUri: string, kid: string, deps: OidcDeps = defaultDeps()): Promise<crypto.KeyObject> => {
  const cached = jwksCache.get(jwksUri);
  const now = deps.now();
  let jwk = cached && now - cached.fetchedAt < JWKS_TTL_MS ? findKey(cached.keys, kid) : undefined;

  if (!jwk) {
    const canRefetch = !cached || now - cached.fetchedAt >= JWKS_REFETCH_MIN_MS;
    if (!canRefetch) throw new OidcError('invalid_token', 'unknown signing key');
    jwk = findKey(await fetchJwks(jwksUri, deps), kid);
  }
  if (!jwk || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') throw new OidcError('invalid_token', 'unknown signing key');
  try {
    return crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
  } catch {
    throw new OidcError('invalid_token', 'signing key is not usable');
  }
};

// ------------------------------------------------------------
// PKCE, state and nonce
// ------------------------------------------------------------
export const base64Url = (bytes: Buffer): string => bytes.toString('base64url');

export const createPkce = (): { verifier: string; challenge: string } => {
  const verifier = base64Url(crypto.randomBytes(48));
  return { verifier, challenge: base64Url(crypto.createHash('sha256').update(verifier).digest()) };
};

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('hex');

const safeEqual = (a: string, b: string): boolean => {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
};

// ------------------------------------------------------------
// Authorization request and code exchange
// ------------------------------------------------------------
export const buildAuthorizationUrl = (
  discovery: DiscoveryDocument,
  params: { clientId: string; redirectUri: string; state: string; nonce: string; codeChallenge: string },
): string => {
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
};

/** Exchanges the authorization code (client secret + PKCE verifier) and returns the raw ID token. */
export const exchangeCode = async (
  discovery: DiscoveryDocument,
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier: string },
  deps: OidcDeps = defaultDeps(),
): Promise<string> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.codeVerifier,
  });
  try {
    const response = await deps.fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // The error body is never surfaced: it can echo request parameters
    if (!response.ok) throw new OidcError('token_exchange_failed', `token endpoint answered ${response.status}`);
    const json = await readJson(response, 'token_exchange_failed');
    if (typeof json.id_token !== 'string' || !json.id_token) throw new OidcError('token_exchange_failed', 'no id_token in the response');
    return json.id_token;
  } catch (error) {
    throw error instanceof OidcError ? error : new OidcError('token_exchange_failed', 'token request failed');
  }
};

// ------------------------------------------------------------
// ID token verification
// ------------------------------------------------------------
export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  preferred_username?: unknown;
  tid?: unknown;
  xms_edov?: unknown;
  azp?: unknown;
  [claim: string]: unknown;
}

/** Whether `iss` is acceptable for this provider (Microsoft multi-tenant issuers name the signer's own tenant). */
export const isIssuerAccepted = (
  claims: Pick<IdTokenClaims, 'iss' | 'tid'>,
  discoveryIssuer: string,
  alternateIssuers: readonly string[] = [],
): boolean => {
  if (discoveryIssuer.includes('{tenantid}')) {
    if (typeof claims.tid !== 'string' || !GUID.test(claims.tid)) return false;
    return claims.iss === discoveryIssuer.replace('{tenantid}', claims.tid.toLowerCase());
  }
  return claims.iss === discoveryIssuer || alternateIssuers.includes(claims.iss);
};

/** `organizations` refuses personal accounts, `consumers` accepts only them; every other value is checked through the issuer. */
export const isTenantAllowed = (tenantSetting: string | undefined, tid: unknown): boolean => {
  if (tenantSetting === undefined) return true;
  const personal = typeof tid === 'string' && tid.toLowerCase() === MICROSOFT_PERSONAL_TENANT;
  if (tenantSetting === 'organizations') return !personal;
  if (tenantSetting === 'consumers') return personal;
  return true;
};

export interface VerifyOptions {
  provider: SsoProviderConfig;
  discovery: DiscoveryDocument;
  nonce: string;
  deps?: OidcDeps;
}

/** Verifies signature (RS256), issuer, audience, expiry (2 minutes of skew) and nonce; returns the claims. */
export const verifyIdToken = async (idToken: string, options: VerifyOptions): Promise<IdTokenClaims> => {
  const deps = options.deps ?? defaultDeps();
  const { provider, discovery } = options;

  const decoded = jwt.decode(idToken, { complete: true });
  const header = decoded?.header as { alg?: unknown; kid?: unknown } | undefined;
  // Only RS256: never `none`, never an HMAC keyed with a public value
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new OidcError('invalid_token', 'unsupported token header');
  }

  const key = await getSigningKey(discovery.jwks_uri, header.kid, deps);
  const nowSeconds = Math.floor(deps.now() / 1000);

  let claims: IdTokenClaims;
  try {
    claims = jwt.verify(idToken, key, {
      algorithms: ['RS256'],
      audience: provider.clientId,
      clockTolerance: CLOCK_SKEW_SECONDS,
      clockTimestamp: nowSeconds,
    }) as IdTokenClaims;
  } catch {
    throw new OidcError('invalid_token', 'signature, audience or expiry check failed');
  }

  // jsonwebtoken does not require these
  if (typeof claims.exp !== 'number' || claims.exp < nowSeconds - CLOCK_SKEW_SECONDS) throw new OidcError('invalid_token', 'expired');
  if (typeof claims.iat !== 'number' || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) throw new OidcError('invalid_token', 'issued-at time is missing or in the future');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new OidcError('invalid_token', 'subject is missing');
  if (typeof claims.iss !== 'string' || !isIssuerAccepted(claims, discovery.issuer, provider.alternateIssuers)) {
    throw new OidcError('invalid_token', 'issuer mismatch');
  }
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== provider.clientId) {
    throw new OidcError('invalid_token', 'authorized party mismatch');
  }
  if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, options.nonce)) throw new OidcError('invalid_token', 'nonce mismatch');
  if (!isTenantAllowed(provider.tenant, claims.tid)) throw new OidcError('tenant_not_allowed', 'account type is not allowed');
  return claims;
};

// ------------------------------------------------------------
// Identity from claims
// ------------------------------------------------------------
export interface SsoIdentity {
  subject: string;
  email: string | null;
  /** The provider vouches that the person controls `email` */
  emailVerified: boolean;
  name: string;
}

const EMAIL = /^[^\s@<>()[\],;:\\"]{1,64}@[^\s@<>()[\],;:\\"]{1,255}$/;

const asEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
};

const isTrue = (value: unknown): boolean => value === true || value === 'true' || value === '1' || value === 1;

/**
 * Email trust rules.
 * - Google: `email` counts only when `email_verified` is true.
 * - Microsoft: `email` (else `preferred_username`, when it looks like an email) counts only when the tenant vouches for it:
 *   a personal Microsoft account, a sign-in configured for one specific tenant (the organization owns that directory), or the
 *   `xms_edov` optional claim ("email domain owner verified"). Elsewhere the claim is editable by the tenant and unverified,
 *   so it is never used to find or link an account.
 */
export const identityFromClaims = (provider: SsoProviderConfig, claims: IdTokenClaims): SsoIdentity => {
  const subject = claims.sub;
  const display = typeof claims.name === 'string' ? claims.name.trim() : '';

  if (provider.id === 'google') {
    const email = asEmail(claims.email);
    return { subject, email, emailVerified: email !== null && isTrue(claims.email_verified), name: display };
  }

  const email = asEmail(claims.email) ?? asEmail(claims.preferred_username);
  const singleTenant = provider.tenant !== undefined && !(MULTI_TENANT_VALUES as readonly string[]).includes(provider.tenant);
  const personal = typeof claims.tid === 'string' && claims.tid.toLowerCase() === MICROSOFT_PERSONAL_TENANT;
  const trusted = personal || singleTenant || isTrue(claims.xms_edov);
  return { subject, email, emailVerified: email !== null && trusted, name: display };
};

/** For tests: forget cached discovery documents and key sets. */
export const clearOidcCache = (): void => {
  discoveryCache.clear();
  jwksCache.clear();
};
