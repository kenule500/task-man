import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { readSsoProviders, type SsoProviderConfig } from '../config/sso.js';
import {
  JWKS_REFETCH_MIN_MS, MICROSOFT_PERSONAL_TENANT, OidcError, buildAuthorizationUrl, clearOidcCache, createPkce, exchangeCode,
  getDiscovery, identityFromClaims, isIssuerAccepted, isTenantAllowed, verifyIdToken, type DiscoveryDocument, type FetchLike,
  type IdTokenClaims, type OidcDeps,
} from '../utils/oidc.js';
import { baseClaims, createFakeKey, jsonResponse, jwksOf, signIdToken } from './helpers/fakeOidcProvider.js';

const NOW = Date.UTC(2030, 0, 1, 12, 0, 0);
const NOW_SECONDS = Math.floor(NOW / 1000);
const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

const google = readSsoProviders({ GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'google-secret' })[0];
const microsoftOf = (tenant?: string): SsoProviderConfig =>
  readSsoProviders({ MICROSOFT_CLIENT_ID: 'ms-client', MICROSOFT_CLIENT_SECRET: 'ms-secret', MICROSOFT_TENANT: tenant })[0];

const googleDiscovery: DiscoveryDocument = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: JWKS_URI,
};

let now = NOW;
const depsWith = (fetchImpl: FetchLike): OidcDeps => ({ fetch: fetchImpl, now: () => now });

beforeEach(() => {
  now = NOW;
  clearOidcCache();
});

describe('provider configuration', () => {
  it('enables a provider only when both id and secret are set', () => {
    expect(readSsoProviders({})).toEqual([]);
    expect(readSsoProviders({ GOOGLE_CLIENT_ID: 'x' })).toEqual([]);
    expect(readSsoProviders({ MICROSOFT_CLIENT_SECRET: 'x' })).toEqual([]);
    expect(readSsoProviders({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', MICROSOFT_CLIENT_ID: 'c', MICROSOFT_CLIENT_SECRET: 'd' }).map(p => p.id))
      .toEqual(['google', 'microsoft']);
  });

  it('defaults the Microsoft tenant to common and refuses odd tenant values', () => {
    expect(microsoftOf().discoveryUrl).toBe('https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration');
    expect(microsoftOf('Contoso.onmicrosoft.com').tenant).toBe('contoso.onmicrosoft.com');
    expect(microsoftOf('evil.example/../x?y').tenant).toBe('common');
  });
});

describe('discovery', () => {
  const doc = { ...googleDiscovery };

  it('is cached for an hour', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(doc));
    const deps = depsWith(fetchMock);
    await getDiscovery(GOOGLE_DISCOVERY_URL, deps);
    now += 59 * 60 * 1000;
    await getDiscovery(GOOGLE_DISCOVERY_URL, deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 2 * 60 * 1000;
    await getDiscovery(GOOGLE_DISCOVERY_URL, deps);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses endpoints that are not https and failed requests', async () => {
    await expect(getDiscovery(GOOGLE_DISCOVERY_URL, depsWith(async () => jsonResponse({ ...doc, token_endpoint: 'http://oauth2.googleapis.com/token' }))))
      .rejects.toMatchObject({ code: 'discovery_failed' });
    clearOidcCache();
    await expect(getDiscovery(GOOGLE_DISCOVERY_URL, depsWith(async () => jsonResponse({}, 500)))).rejects.toMatchObject({ code: 'discovery_failed' });
    clearOidcCache();
    await expect(getDiscovery(GOOGLE_DISCOVERY_URL, depsWith(async () => { throw new Error('offline'); }))).rejects.toMatchObject({ code: 'discovery_failed' });
  });
});

describe('verifyIdToken', () => {
  const key = createFakeKey('kid-1');
  const NONCE = 'nonce-123';
  const claimsFor = (extra: Record<string, unknown> = {}) =>
    baseClaims(NOW, { iss: 'https://accounts.google.com', aud: 'google-client', sub: 'sub-1', nonce: NONCE, email: 'a@example.com', email_verified: true, ...extra });
  const serve = (...keys: ReturnType<typeof createFakeKey>[]) => jest.fn(async () => jsonResponse(jwksOf(...keys)));
  const verify = (token: string, fetchMock: FetchLike, provider = google, discovery = googleDiscovery) =>
    verifyIdToken(token, { provider, discovery, nonce: NONCE, deps: depsWith(fetchMock) });

  it('accepts a valid token', async () => {
    const claims = await verify(signIdToken(key, claimsFor()), serve(key));
    expect(claims).toMatchObject({ sub: 'sub-1', email: 'a@example.com' });
  });

  it('accepts the bare Google issuer and tokens inside the 2 minute skew', async () => {
    const fetchMock = serve(key);
    await expect(verify(signIdToken(key, claimsFor({ iss: 'accounts.google.com' })), fetchMock)).resolves.toBeDefined();
    await expect(verify(signIdToken(key, claimsFor({ exp: NOW_SECONDS - 90 })), fetchMock)).resolves.toBeDefined();
    await expect(verify(signIdToken(key, claimsFor({ iat: NOW_SECONDS + 90 })), fetchMock)).resolves.toBeDefined();
  });

  it.each([
    ['wrong audience', { aud: 'someone-else' }],
    ['wrong issuer', { iss: 'https://evil.example' }],
    ['issuer with a trailing slash', { iss: 'https://accounts.google.com/' }],
    ['expired beyond the skew', { exp: NOW_SECONDS - 180 }],
    ['issued in the future', { iat: NOW_SECONDS + 180 }],
    ['nonce mismatch', { nonce: 'other' }],
    ['missing nonce', { nonce: undefined }],
    ['missing exp', { exp: undefined }],
    ['missing subject', { sub: undefined }],
    ['several audiences without azp', { aud: ['google-client', 'other'] }],
  ])('rejects %s', async (_name, extra) => {
    const token = signIdToken(key, claimsFor(extra as Record<string, unknown>));
    await expect(verify(token, serve(key))).rejects.toBeInstanceOf(OidcError);
  });

  it('accepts several audiences when azp names the client', async () => {
    await expect(verify(signIdToken(key, claimsFor({ aud: ['google-client', 'other'], azp: 'google-client' })), serve(key))).resolves.toBeDefined();
  });

  it('rejects a signature from another key, a tampered payload and unsupported algorithms', async () => {
    const attacker = createFakeKey('kid-1');
    await expect(verify(signIdToken(attacker, claimsFor()), serve(key))).rejects.toBeInstanceOf(OidcError);

    const good = signIdToken(key, claimsFor());
    const [header, , signature] = good.split('.');
    const payload = Buffer.from(JSON.stringify(claimsFor({ sub: 'admin' }))).toString('base64url');
    await expect(verify(`${header}.${payload}.${signature}`, serve(key))).rejects.toBeInstanceOf(OidcError);

    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: 'kid-1' })).toString('base64url')}.${Buffer.from(JSON.stringify(claimsFor())).toString('base64url')}.`;
    await expect(verify(none, serve(key))).rejects.toBeInstanceOf(OidcError);

    // HS256 keyed with the public key (classic algorithm confusion)
    const publicPem = crypto.createPublicKey(key.privateKey).export({ type: 'spki', format: 'pem' });
    const confused = jwt.sign(claimsFor(), publicPem as string, { algorithm: 'HS256', keyid: 'kid-1' });
    await expect(verify(confused, serve(key))).rejects.toBeInstanceOf(OidcError);
    await expect(verify('not-a-jwt', serve(key))).rejects.toBeInstanceOf(OidcError);
  });

  it('caches the key set, refetches for an unknown kid (rate limited) and picks up rotated keys', async () => {
    const rotated = createFakeKey('kid-2');
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(jwksOf(key)))
      .mockResolvedValue(jsonResponse(jwksOf(key, rotated)));
    const deps = depsWith(fetchMock);
    const run = (token: string) => verifyIdToken(token, { provider: google, discovery: googleDiscovery, nonce: NONCE, deps });

    await run(signIdToken(key, claimsFor()));
    await run(signIdToken(key, claimsFor()));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Unknown kid right after a fetch: no refetch, rejected
    await expect(run(signIdToken(rotated, claimsFor()))).rejects.toBeInstanceOf(OidcError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += JWKS_REFETCH_MIN_MS + 1000;
    await expect(run(signIdToken(rotated, claimsFor()))).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a failing key endpoint', async () => {
    await expect(verify(signIdToken(key, claimsFor()), jest.fn(async () => jsonResponse({}, 503)))).rejects.toMatchObject({ code: 'jwks_failed' });
  });

  describe('Microsoft issuers and tenants', () => {
    const TID = '11111111-2222-3333-4444-555555555555';
    const template: DiscoveryDocument = { ...googleDiscovery, issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0' };
    const msClaims = (extra: Record<string, unknown> = {}) =>
      claimsFor({ iss: `https://login.microsoftonline.com/${TID}/v2.0`, aud: 'ms-client', tid: TID, ...extra });

    it('fills the tenant into the issuer template from the tid claim', async () => {
      await expect(verify(signIdToken(key, msClaims()), serve(key), microsoftOf(), template)).resolves.toBeDefined();
      await expect(verify(signIdToken(key, msClaims({ tid: '99999999-2222-3333-4444-555555555555' })), serve(key), microsoftOf(), template))
        .rejects.toBeInstanceOf(OidcError);
      await expect(verify(signIdToken(key, msClaims({ tid: 'not-a-guid' })), serve(key), microsoftOf(), template)).rejects.toBeInstanceOf(OidcError);
    });

    it('applies the organizations and consumers rules', async () => {
      const personal = msClaims({ tid: MICROSOFT_PERSONAL_TENANT, iss: `https://login.microsoftonline.com/${MICROSOFT_PERSONAL_TENANT}/v2.0` });
      await expect(verify(signIdToken(key, personal), serve(key), microsoftOf('organizations'), template)).rejects.toMatchObject({ code: 'tenant_not_allowed' });
      await expect(verify(signIdToken(key, personal), serve(key), microsoftOf('consumers'), template)).resolves.toBeDefined();
      await expect(verify(signIdToken(key, msClaims()), serve(key), microsoftOf('consumers'), template)).rejects.toMatchObject({ code: 'tenant_not_allowed' });
      await expect(verify(signIdToken(key, personal), serve(key), microsoftOf('common'), template)).resolves.toBeDefined();
    });

    it('matches the issuer exactly for a single tenant', async () => {
      const single = { ...googleDiscovery, issuer: `https://login.microsoftonline.com/${TID}/v2.0` };
      await expect(verify(signIdToken(key, msClaims()), serve(key), microsoftOf(TID), single)).resolves.toBeDefined();
      const other = msClaims({ iss: 'https://login.microsoftonline.com/99999999-2222-3333-4444-555555555555/v2.0' });
      await expect(verify(signIdToken(key, other), serve(key), microsoftOf(TID), single)).rejects.toBeInstanceOf(OidcError);
    });
  });
});

describe('issuer and tenant helpers', () => {
  it('isIssuerAccepted needs an exact match', () => {
    expect(isIssuerAccepted({ iss: 'https://accounts.google.com' }, 'https://accounts.google.com')).toBe(true);
    expect(isIssuerAccepted({ iss: 'https://accounts.google.com.evil.example' }, 'https://accounts.google.com')).toBe(false);
    expect(isIssuerAccepted({ iss: 'accounts.google.com' }, 'https://accounts.google.com', ['accounts.google.com'])).toBe(true);
  });

  it('isTenantAllowed', () => {
    expect(isTenantAllowed(undefined, 'x')).toBe(true);
    expect(isTenantAllowed('common', MICROSOFT_PERSONAL_TENANT)).toBe(true);
    expect(isTenantAllowed('organizations', MICROSOFT_PERSONAL_TENANT.toUpperCase())).toBe(false);
  });
});

describe('identityFromClaims', () => {
  const claims = (extra: Record<string, unknown>): IdTokenClaims => ({ iss: 'i', sub: 's', aud: 'a', exp: 1, iat: 1, ...extra });
  const TID = '11111111-2222-3333-4444-555555555555';

  it('Google needs email_verified', () => {
    expect(identityFromClaims(google, claims({ email: 'A@Example.com', email_verified: true, name: ' Ada ' })))
      .toEqual({ subject: 's', email: 'a@example.com', emailVerified: true, name: 'Ada' });
    expect(identityFromClaims(google, claims({ email: 'a@example.com', email_verified: false })).emailVerified).toBe(false);
    expect(identityFromClaims(google, claims({ email: 'a@example.com' })).emailVerified).toBe(false);
    expect(identityFromClaims(google, claims({ email_verified: true })).email).toBeNull();
  });

  it('Microsoft trusts personal accounts, single tenants and xms_edov only', () => {
    const common = microsoftOf();
    expect(identityFromClaims(common, claims({ email: 'a@example.com', tid: TID })).emailVerified).toBe(false);
    expect(identityFromClaims(common, claims({ email: 'a@example.com', tid: MICROSOFT_PERSONAL_TENANT })).emailVerified).toBe(true);
    expect(identityFromClaims(common, claims({ email: 'a@example.com', xms_edov: true })).emailVerified).toBe(true);
    expect(identityFromClaims(common, claims({ email: 'a@example.com', xms_edov: '1' })).emailVerified).toBe(true);
    expect(identityFromClaims(microsoftOf(TID), claims({ email: 'a@example.com' })).emailVerified).toBe(true);
  });

  it('Microsoft falls back to preferred_username only when it is an email', () => {
    const provider = microsoftOf('contoso.onmicrosoft.com');
    expect(identityFromClaims(provider, claims({ preferred_username: 'Ada@Contoso.com' })).email).toBe('ada@contoso.com');
    expect(identityFromClaims(provider, claims({ preferred_username: 'ada' })).email).toBeNull();
    expect(identityFromClaims(provider, claims({ preferred_username: 'ada' })).emailVerified).toBe(false);
  });
});

describe('PKCE, authorization URL and code exchange', () => {
  const exchangeParams = { clientId: 'c', clientSecret: 's3', code: 'abc', redirectUri: 'https://x/cb', codeVerifier: 'ver' };

  it('derives the S256 challenge from the verifier', () => {
    const { verifier, challenge } = createPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(crypto.createHash('sha256').update(verifier).digest('base64url'));
  });

  it('builds the authorization URL with state, nonce, PKCE and account chooser', () => {
    const redirectUri = 'https://app.example/api/auth/sso/google/callback';
    const url = new URL(buildAuthorizationUrl(googleDiscovery, { clientId: 'c', redirectUri, state: 's', nonce: 'n', codeChallenge: 'ch' }));
    expect(url.origin + url.pathname).toBe(googleDiscovery.authorization_endpoint);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'c', redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
      state: 's', nonce: 'n', code_challenge: 'ch', code_challenge_method: 'S256', prompt: 'select_account',
    });
  });

  it('posts the code with the secret and verifier', async () => {
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toMatchObject({
        grant_type: 'authorization_code', code: 'abc', client_secret: 's3', code_verifier: 'ver',
      });
      return jsonResponse({ id_token: 'the-token' });
    });
    await expect(exchangeCode(googleDiscovery, exchangeParams, depsWith(fetchMock))).resolves.toBe('the-token');
  });

  it('fails without leaking the provider error body, and without an id_token', async () => {
    const failing = depsWith(async () => jsonResponse({ error: 'invalid_grant', detail: 'secret details' }, 400));
    const error = await exchangeCode(googleDiscovery, exchangeParams, failing).catch(e => e as OidcError);
    expect(error).toMatchObject({ code: 'token_exchange_failed' });
    expect((error as OidcError).message).not.toContain('secret details');

    await expect(exchangeCode(googleDiscovery, exchangeParams, depsWith(async () => jsonResponse({}))))
      .rejects.toMatchObject({ code: 'token_exchange_failed' });
  });
});
