import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  PASSWORD, bearer, http, login, registerUser, signup, startApp, stopApp, uniqueEmail,
} from './harness.js';
import { generateTotp } from '../utils/totp.js';
import { readChallenge } from '../utils/twoFactor.js';
import { clearOidcCache } from '../utils/oidc.js';
import {
  baseClaims, createFakeKey, jsonResponse, jwksOf, signIdToken, type FakeKey,
} from '../__tests__/helpers/fakeOidcProvider.js';

// The sensitive limiter would block the many sign-ins below
jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const GOOGLE_ID = 'google-client-id';
const GOOGLE_SECRET = 'google-client-secret';
const MICROSOFT_ID = 'microsoft-client-id';
const MICROSOFT_SECRET = 'microsoft-client-secret';
const APP = 'http://localhost:5173';

const GOOGLE = {
  discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
  doc: {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token',
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  },
};
const MICROSOFT = {
  discoveryUrl: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
  doc: {
    issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0',
    authorization_endpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token_endpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    jwks_uri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  },
};

const key = createFakeKey('it-key');
const attackerKey = createFakeKey('it-key'); // same kid, different key pair

interface PendingCode {
  idToken: string;
  challenge: string;
  clientId: string;
  clientSecret: string;
  fail?: boolean;
}
const codes = new Map<string, PendingCode>();
let codeCounter = 0;
let providerCalls: string[] = [];

/** The fake identity providers: discovery, JWKS and token endpoints. Anything else is a test bug. */
const fakeFetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  providerCalls.push(url);
  if (url === GOOGLE.discoveryUrl) return jsonResponse(GOOGLE.doc);
  if (url === MICROSOFT.discoveryUrl) return jsonResponse(MICROSOFT.doc);
  if (url === GOOGLE.doc.jwks_uri || url === MICROSOFT.doc.jwks_uri) return jsonResponse(jwksOf(key));
  if (url === GOOGLE.doc.token_endpoint || url === MICROSOFT.doc.token_endpoint) {
    const form = Object.fromEntries(new URLSearchParams(String(init?.body)));
    const pending = codes.get(form.code);
    codes.delete(form.code); // an authorization code works once
    const pkceOk = Boolean(form.code_verifier)
      && crypto.createHash('sha256').update(form.code_verifier).digest('base64url') === pending?.challenge;
    const redirectOk = form.redirect_uri === `${APP}/api/auth/sso/${url === GOOGLE.doc.token_endpoint ? 'google' : 'microsoft'}/callback`;
    if (!pending || pending.fail || !pkceOk || !redirectOk
      || form.client_id !== pending.clientId || form.client_secret !== pending.clientSecret
      || form.grant_type !== 'authorization_code') {
      return jsonResponse({ error: 'invalid_grant' }, 400);
    }
    return jsonResponse({ id_token: pending.idToken, access_token: 'unused', token_type: 'Bearer' });
  }
  throw new Error(`unexpected outbound request to ${url}`);
};

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = GOOGLE_ID;
  process.env.GOOGLE_CLIENT_SECRET = GOOGLE_SECRET;
  delete process.env.MICROSOFT_CLIENT_ID;
  delete process.env.MICROSOFT_CLIENT_SECRET;
  delete process.env.MICROSOFT_TENANT;
  delete process.env.API_PUBLIC_URL;
  jest.spyOn(globalThis, 'fetch').mockImplementation(fakeFetch as typeof fetch);
  await startApp();
});
afterAll(async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  jest.restoreAllMocks();
  await stopApp();
});
beforeEach(() => {
  providerCalls = [];
  clearOidcCache();
});

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
type ProviderName = 'google' | 'microsoft';

const startFlow = async (provider: ProviderName = 'google', redirect?: string) => {
  const res = await http().get(`/api/auth/sso/${provider}/start`).query(redirect === undefined ? {} : { redirect });
  expect(res.status).toBe(302);
  const url = new URL(res.headers.location);
  return {
    res,
    url,
    provider,
    state: url.searchParams.get('state') as string,
    nonce: url.searchParams.get('nonce') as string,
    challenge: url.searchParams.get('code_challenge') as string,
  };
};
type Flow = Awaited<ReturnType<typeof startFlow>>;

interface FinishOptions {
  signer?: FakeKey;
  state?: string;
  aud?: string;
  nonce?: string;
  iss?: string;
  expired?: boolean;
  failExchange?: boolean;
}

/** The provider redirects back with a code for an ID token carrying `claims`. */
const finish = (flow: Flow, claims: Record<string, unknown>, options: FinishOptions = {}) => {
  const google = flow.provider === 'google';
  const now = Date.now();
  const idToken = signIdToken(options.signer ?? key, baseClaims(now, {
    iss: options.iss ?? (google ? GOOGLE.doc.issuer : undefined),
    aud: options.aud ?? (google ? GOOGLE_ID : MICROSOFT_ID),
    nonce: options.nonce ?? flow.nonce,
    ...(options.expired ? { exp: Math.floor(now / 1000) - 3600 } : {}),
    ...claims,
  }));
  const code = `code-${codeCounter++}`;
  codes.set(code, {
    idToken,
    challenge: flow.challenge,
    clientId: google ? GOOGLE_ID : MICROSOFT_ID,
    clientSecret: google ? GOOGLE_SECRET : MICROSOFT_SECRET,
    fail: options.failExchange,
  });
  return http().get(`/api/auth/sso/${flow.provider}/callback`).query({ code, state: options.state ?? flow.state });
};

const outcome = (res: { status: number; headers: Record<string, string> }) => {
  expect(res.status).toBe(302);
  const url = new URL(res.headers.location);
  return {
    origin: url.origin,
    path: url.pathname,
    query: url.searchParams,
    hash: new URLSearchParams(url.hash.slice(1)),
    raw: res.headers.location,
  };
};

const googleClaims = (email: string, extra: Record<string, unknown> = {}) => ({
  sub: `google-${crypto.randomBytes(6).toString('hex')}`, email, email_verified: true, name: 'Grace Hopper', ...extra,
});

/** Full sign-in with Google; returns the parsed redirect. */
const signInWithGoogle = async (claims: Record<string, unknown>, options: FinishOptions = {}, redirect?: string) =>
  outcome(await finish(await startFlow('google', redirect), claims, options));

const storedUser = (email: string) => mongoose.connection.collection('users').findOne({ email: email.toLowerCase() });
const sessionCount = (userId: unknown) =>
  mongoose.connection.collection('sessions').countDocuments({ user: new mongoose.Types.ObjectId(String(userId)) });

const expectError = (result: ReturnType<typeof outcome>, code: string) => {
  expect(result.origin).toBe(APP);
  expect(result.path).toBe('/login');
  expect(result.query.get('sso_error')).toBe(code);
  expect(result.hash.get('token')).toBeNull();
  expect(result.raw).not.toMatch(/token=/);
};

// ----------------------------------------------------------------
// Providers and the start of a sign-in
// ----------------------------------------------------------------
describe('sso: providers and start', () => {
  it('lists only the providers that are configured, without secrets', async () => {
    const res = await http().get('/api/auth/sso/providers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ providers: [{ id: 'google', label: 'Google' }] });
    expect(JSON.stringify(res.body)).not.toContain(GOOGLE_SECRET);
  });

  it('answers 404 for a provider that is not configured or does not exist', async () => {
    expect((await http().get('/api/auth/sso/microsoft/start')).status).toBe(404);
    expect((await http().get('/api/auth/sso/microsoft/callback').query({ code: 'x', state: 'a'.repeat(64) })).status).toBe(404);
    expect((await http().get('/api/auth/sso/github/start')).status).toBe(404);
    expect((await http().get('/api/auth/sso/__proto__/start')).status).toBe(404);
  });

  it('redirects to the provider with state, nonce, S256 PKCE and the callback URL, and sets no cookie', async () => {
    const flow = await startFlow();
    const { url, res } = flow;
    expect(url.origin + url.pathname).toBe(GOOGLE.doc.authorization_endpoint);
    expect(url.searchParams.get('client_id')).toBe(GOOGLE_ID);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(`${APP}/api/auth/sso/google/callback`);
    expect(flow.state).toMatch(/^[a-f0-9]{64}$/);
    expect(flow.nonce.length).toBeGreaterThanOrEqual(32);
    expect(flow.challenge.length).toBeGreaterThanOrEqual(43);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(url.toString()).not.toContain(GOOGLE_SECRET);
  });

  it('stores only a hash of the state, with a ten minute lifetime', async () => {
    const flow = await startFlow('google', '/join/ABC123');
    const rows = await mongoose.connection.collection('ssostates').find({}).toArray();
    expect(JSON.stringify(rows)).not.toContain(flow.state);
    const row = rows.find(item => item.stateHash === crypto.createHash('sha256').update(flow.state).digest('hex'));
    expect(row).toBeDefined();
    expect(row?.redirect).toBe('/join/ABC123');
    const lifetime = (row?.expiresAt as Date).getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(9 * 60 * 1000);
    expect(lifetime).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('rejects redirects that leave the app', async () => {
    const before = await mongoose.connection.collection('ssostates').countDocuments();
    for (const redirect of ['https://evil.example', '//evil.example', '/\\evil.example', 'evil.example', 'javascript:alert(1)']) {
      const res = await http().get('/api/auth/sso/google/start').query({ redirect });
      expect(res.status).toBe(400);
      expect(res.headers.location).toBeUndefined();
    }
    expect(await mongoose.connection.collection('ssostates').countDocuments()).toBe(before);
  });

  it('answers 502 when the provider cannot be reached', async () => {
    jest.mocked(globalThis.fetch).mockImplementationOnce(async () => { throw new Error('offline'); });
    const res = await http().get('/api/auth/sso/google/start');
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/could not be reached/);
  });
});

// ----------------------------------------------------------------
// Callback: accounts
// ----------------------------------------------------------------
describe('sso: signing in', () => {
  it('creates a verified account for a new person and hands the session over in the fragment', async () => {
    const email = uniqueEmail('Newcomer');
    const result = await signInWithGoogle(googleClaims(email, { name: 'Ada Lovelace' }));

    expect(result.origin).toBe(APP);
    expect(result.path).toBe('/sso/complete');
    expect(result.query.toString()).toBe('');
    const token = result.hash.get('token') as string;
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

    const profile = await http().get('/api/profile').set(bearer(token));
    expect(profile.status).toBe(200);
    expect(profile.body.email).toBe(email.toLowerCase());
    expect(profile.body.name).toBe('Ada Lovelace');
    expect(profile.body.isVerified).toBe(true);
    // Provider links never leave the server through the user object
    expect(JSON.stringify(profile.body)).not.toMatch(/subject|ssoOnly/);

    const user = await storedUser(email);
    expect(user?.ssoOnly).toBe(true);
    expect(user?.sso).toHaveLength(1);
    expect(user?.sso[0]).toMatchObject({ provider: 'google', email: email.toLowerCase() });
    expect(String(user?.password)).toMatch(/^\$2[aby]\$/); // a bcrypt hash of a value nobody knows
    expect(await sessionCount(user?._id)).toBe(1);
  });

  it('keeps the validated redirect path through the round trip', async () => {
    const result = await signInWithGoogle(googleClaims(uniqueEmail('invitee')), {}, '/accept-invite/abc123');
    expect(result.path).toBe('/sso/complete');
    expect(result.hash.get('redirect')).toBe('/accept-invite/abc123');
  });

  it('links an existing verified account by email and keeps its password working', async () => {
    const user = await registerUser('Linus Existing');
    const claims = googleClaims(user.email.toUpperCase());
    const result = await signInWithGoogle(claims);
    expect(result.path).toBe('/sso/complete');

    const profile = await http().get('/api/profile').set(bearer(result.hash.get('token') as string));
    expect(profile.body._id).toBe(user.id);

    const stored = await storedUser(user.email);
    expect(stored?.sso).toHaveLength(1);
    expect(stored?.ssoOnly).toBe(false);
    expect((await login(user.email)).status).toBe(200);

    // The linked subject is the identity from now on, even when the email claim changes
    const again = await signInWithGoogle({ ...claims, email: uniqueEmail('changed') });
    const profileAgain = await http().get('/api/profile').set(bearer(again.hash.get('token') as string));
    expect(profileAgain.body._id).toBe(user.id);
  });

  it('takes over an unverified account: the password someone set before proving the address stops working', async () => {
    const email = uniqueEmail('squatted');
    expect((await signup({ name: 'Squatter', email, password: PASSWORD })).status).toBe(201);
    expect((await login(email)).status).toBe(403);

    const result = await signInWithGoogle(googleClaims(email));
    expect(result.path).toBe('/sso/complete');
    const stored = await storedUser(email);
    expect(stored?.isVerified).toBe(true);
    expect(stored?.ssoOnly).toBe(true);
    expect(stored?.verificationToken).toBeUndefined();
    expect((await login(email)).status).toBe(401);
  });

  it('refuses an email the provider has not verified, and creates nothing', async () => {
    const email = uniqueEmail('unverified');
    const result = await signInWithGoogle(googleClaims(email, { email_verified: false }));
    expectError(result, 'email_unverified');
    expect(await storedUser(email)).toBeNull();

    const missing = await signInWithGoogle({ sub: 'no-email-sub' });
    expectError(missing, 'email_missing');
  });

  it('refuses a second Google identity for an account that already has one', async () => {
    const email = uniqueEmail('twice');
    await signInWithGoogle(googleClaims(email));
    const result = await signInWithGoogle(googleClaims(email));
    expectError(result, 'account_conflict');
    expect((await storedUser(email))?.sso).toHaveLength(1);
  });

  it('does not match accounts through operator payloads in the email claim', async () => {
    const result = await signInWithGoogle(googleClaims({ $ne: '' } as unknown as string));
    expectError(result, 'email_missing');
  });
});

// ----------------------------------------------------------------
// Callback: state, nonce and token checks
// ----------------------------------------------------------------
describe('sso: callback validation', () => {
  it('rejects unknown, malformed and missing state', async () => {
    const flow = await startFlow();
    expectError(outcome(await finish(flow, googleClaims(uniqueEmail('x')), { state: crypto.randomBytes(32).toString('hex') })), 'invalid_state');
    expectError(outcome(await finish(flow, googleClaims(uniqueEmail('x')), { state: 'short' })), 'invalid_state');
    expectError(outcome(await http().get('/api/auth/sso/google/callback').query({ code: 'x' })), 'invalid_state');
    expectError(outcome(await http().get('/api/auth/sso/google/callback').query({ code: 'x', state: { $ne: '' } })), 'invalid_state');
    // None of that consumed the real state
    expect(outcome(await finish(flow, googleClaims(uniqueEmail('fine')))).path).toBe('/sso/complete');
  });

  it('accepts a state once: a replay fails and creates no second session', async () => {
    const email = uniqueEmail('replay');
    const flow = await startFlow();
    const claims = googleClaims(email);
    expect(outcome(await finish(flow, claims)).path).toBe('/sso/complete');
    const user = await storedUser(email);
    expect(await sessionCount(user?._id)).toBe(1);

    expectError(outcome(await finish(flow, claims)), 'invalid_state');
    expect(await sessionCount(user?._id)).toBe(1);
  });

  it('rejects an expired state', async () => {
    const flow = await startFlow();
    await mongoose.connection.collection('ssostates').updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expectError(outcome(await finish(flow, googleClaims(uniqueEmail('late')))), 'invalid_state');
  });

  it('consumes the state even when the sign-in fails', async () => {
    const flow = await startFlow();
    expectError(outcome(await finish(flow, googleClaims(uniqueEmail('mismatch')), { nonce: 'not-the-nonce' })), 'invalid_token');
    expectError(outcome(await finish(flow, googleClaims(uniqueEmail('mismatch')))), 'invalid_state');
  });

  it.each([
    ['nonce mismatch', { nonce: 'a-different-nonce' }],
    ['wrong audience', { aud: 'another-client-id' }],
    ['wrong issuer', { iss: 'https://evil.example' }],
    ['expired token', { expired: true }],
    ['signature from another key', { signer: attackerKey }],
  ])('rejects an ID token with %s', async (_name, options) => {
    const email = uniqueEmail('badtoken');
    const result = await signInWithGoogle(googleClaims(email), options as FinishOptions);
    expectError(result, 'invalid_token');
    expect(await storedUser(email)).toBeNull();
  });

  it('turns provider errors and failed exchanges into fixed codes', async () => {
    const denied = await startFlow();
    const deniedRes = await http().get('/api/auth/sso/google/callback').query({ error: 'access_denied', error_description: '<script>', state: denied.state });
    expectError(outcome(deniedRes), 'access_denied');
    expect(deniedRes.headers.location).not.toContain('script');

    const failing = await startFlow();
    expectError(outcome(await finish(failing, googleClaims(uniqueEmail('x')), { failExchange: true })), 'provider_error');
  });

  it('sends the client secret and PKCE verifier only to the token endpoint', async () => {
    const flow = await startFlow();
    const res = await finish(flow, googleClaims(uniqueEmail('pkce')));
    expect(outcome(res).path).toBe('/sso/complete');
    expect(res.headers.location).not.toContain(GOOGLE_SECRET);
    expect(providerCalls).toContain(GOOGLE.doc.token_endpoint);
  });
});

// ----------------------------------------------------------------
// Two-factor accounts
// ----------------------------------------------------------------
describe('sso: two-factor accounts', () => {
  it('answers with a challenge instead of a session, and the code completes the sign-in', async () => {
    const user = await registerUser('Tina Twofactor');
    const setup = await http().post('/api/profile/2fa/setup').set(bearer(user.token));
    const secret = setup.body.secret as string;
    const enabled = await http().post('/api/profile/2fa/enable').set(bearer(user.token)).send({ code: generateTotp(secret, Date.now()), password: PASSWORD });
    expect(enabled.status).toBe(200);

    const before = await sessionCount(user.id);
    const result = await signInWithGoogle(googleClaims(user.email), {}, '/join/XYZ');
    expect(result.path).toBe('/login');
    expect(result.hash.get('token')).toBeNull();
    expect(result.query.get('sso_error')).toBeNull();
    expect(result.hash.get('redirect')).toBe('/join/XYZ');
    const challenge = result.hash.get('challenge') as string;
    expect(readChallenge(challenge)?.id).toBe(user.id);
    expect(await sessionCount(user.id)).toBe(before);

    const second = await http().post('/api/auth/login/2fa').send({ challenge, code: generateTotp(secret, Date.now() + 30_000) });
    expect(second.status).toBe(200);
    expect(typeof second.body.token).toBe('string');
    expect(await sessionCount(user.id)).toBe(before + 1);
  });
});

// ----------------------------------------------------------------
// Microsoft
// ----------------------------------------------------------------
describe('sso: Microsoft', () => {
  const TID = '11111111-2222-3333-4444-555555555555';
  beforeAll(() => {
    process.env.MICROSOFT_CLIENT_ID = MICROSOFT_ID;
    process.env.MICROSOFT_CLIENT_SECRET = MICROSOFT_SECRET;
  });
  afterAll(() => {
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
  });

  const microsoftClaims = (email: string, extra: Record<string, unknown> = {}) => ({
    iss: `https://login.microsoftonline.com/${TID}/v2.0`,
    sub: `ms-${crypto.randomBytes(6).toString('hex')}`,
    tid: TID,
    email,
    name: 'Mary Microsoft',
    ...extra,
  });

  it('is listed once configured and starts against the tenant-neutral endpoint', async () => {
    const list = await http().get('/api/auth/sso/providers');
    expect(list.body.providers.map((provider: { id: string }) => provider.id)).toEqual(['google', 'microsoft']);
    const flow = await startFlow('microsoft');
    expect(flow.url.origin + flow.url.pathname).toBe(MICROSOFT.doc.authorization_endpoint);
    expect(flow.url.searchParams.get('client_id')).toBe(MICROSOFT_ID);
  });

  it('does not trust an email that the tenant has not verified', async () => {
    const email = uniqueEmail('workuser');
    const result = outcome(await finish(await startFlow('microsoft'), microsoftClaims(email)));
    expectError(result, 'email_unverified');
    expect(await storedUser(email)).toBeNull();
  });

  it('trusts an email verified through xms_edov', async () => {
    const email = uniqueEmail('verifiedwork');
    const result = outcome(await finish(await startFlow('microsoft'), microsoftClaims(email, { xms_edov: true })));
    expect(result.path).toBe('/sso/complete');
    expect((await storedUser(email))?.sso[0]).toMatchObject({ provider: 'microsoft' });
  });

  it('rejects a token whose issuer names a different tenant than its tid', async () => {
    const result = outcome(await finish(await startFlow('microsoft'), microsoftClaims(uniqueEmail('forged'), {
      xms_edov: true, iss: 'https://login.microsoftonline.com/99999999-2222-3333-4444-555555555555/v2.0',
    })));
    expectError(result, 'invalid_token');
  });
});

// ----------------------------------------------------------------
// Linked sign-in methods in the profile
// ----------------------------------------------------------------
describe('sso: linked methods', () => {
  it('needs a signed-in user', async () => {
    expect((await http().get('/api/profile/sso')).status).toBe(401);
    expect((await http().delete('/api/profile/sso/google')).status).toBe(401);
  });

  it('lists the methods of an account that also has a password and lets it remove one', async () => {
    const user = await registerUser('Una Unlink');
    await signInWithGoogle(googleClaims(user.email));

    const list = await http().get('/api/profile/sso').set(bearer(user.token));
    expect(list.status).toBe(200);
    expect(list.body.hasPassword).toBe(true);
    expect(list.body.methods).toHaveLength(1);
    expect(list.body.methods[0]).toMatchObject({ provider: 'google', email: user.email });
    expect(JSON.stringify(list.body)).not.toMatch(/subject/);

    expect((await http().delete('/api/profile/sso/github').set(bearer(user.token))).status).toBe(404);
    expect((await http().delete('/api/profile/sso/google').set(bearer(user.token))).status).toBe(200);
    expect((await http().get('/api/profile/sso').set(bearer(user.token))).body.methods).toEqual([]);
    expect((await http().delete('/api/profile/sso/google').set(bearer(user.token))).status).toBe(404);
  });

  it('keeps the only way into an account that has no password', async () => {
    const email = uniqueEmail('ssoonly');
    const token = (await signInWithGoogle(googleClaims(email))).hash.get('token') as string;
    const list = await http().get('/api/profile/sso').set(bearer(token));
    expect(list.body.hasPassword).toBe(false);

    const refused = await http().delete('/api/profile/sso/google').set(bearer(token));
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('LAST_SIGN_IN_METHOD');
    expect((await storedUser(email))?.sso).toHaveLength(1);

    // A second method makes the first one removable
    await mongoose.connection.collection('users').updateOne({ email }, { $push: { sso: { provider: 'microsoft', subject: 'ms-sub', email, linkedAt: new Date() } } as never });
    expect((await http().delete('/api/profile/sso/google').set(bearer(token))).status).toBe(200);
    expect((await http().delete('/api/profile/sso/microsoft').set(bearer(token))).status).toBe(400);
  });

  it('lets a person who reset their password through email unlink the last method', async () => {
    const email = uniqueEmail('ssoreset');
    const token = (await signInWithGoogle(googleClaims(email))).hash.get('token') as string;
    await mongoose.connection.collection('users').updateOne({ email }, { $set: { ssoOnly: false } });
    expect((await http().delete('/api/profile/sso/google').set(bearer(token))).status).toBe(200);
  });
});
