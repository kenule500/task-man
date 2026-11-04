import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import {
  PASSWORD, bearer, createTeam, http, login, registerUser, startApp, stopApp, type TestUser,
} from './harness.js';
import { generateTotp } from '../utils/totp.js';

// This file signs in far more often than the 20 attempts per 15 minutes the sensitive limiter allows
jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Codes are valid once and for a 30 second step, so the tests move the server's clock forward
// (Date.now is shared by the app and the test) to get a fresh code each time.
const realNow = Date.now.bind(Date);
let skewMs = 0;
beforeAll(async () => {
  await startApp();
  jest.spyOn(Date, 'now').mockImplementation(() => realNow() + skewMs);
});
afterAll(async () => {
  jest.restoreAllMocks();
  await stopApp();
});

/** A code from a newer time step than any code returned before. */
const nextCode = (secret: string): string => {
  skewMs += 30_000;
  return generateTotp(secret, Date.now());
};

const RECOVERY_SHAPE = /^[a-z0-9]{4}-[a-z0-9]{4}$/;

const profileUrl = '/api/profile';
const post = (path: string, user: TestUser, body: Record<string, unknown> = {}) =>
  http().post(`${profileUrl}/2fa${path}`).set(bearer(user.token)).send(body);
const status = (user: TestUser) => http().get(`${profileUrl}/2fa`).set(bearer(user.token));
const storedUser = (email: string) => mongoose.connection.collection('users').findOne({ email });

/** Setup + enable through the API. */
const enableTwoFactor = async (user: TestUser) => {
  const setup = await post('/setup', user);
  if (setup.status !== 200) throw new Error(`setup failed: ${setup.status}`);
  const secret = setup.body.secret as string;
  const enabled = await post('/enable', user, { code: nextCode(secret), password: PASSWORD });
  if (enabled.status !== 200) throw new Error(`enable failed: ${enabled.status} ${JSON.stringify(enabled.body)}`);
  return { secret, recoveryCodes: enabled.body.recoveryCodes as string[] };
};

/** Password step of a sign-in for an account with 2FA. */
const startLogin = async (user: TestUser) => {
  const res = await login(user.email);
  if (res.status !== 200 || !res.body.twoFactorRequired) throw new Error(`no challenge: ${res.status}`);
  return res.body.challenge as string;
};
const secondStep = (body: Record<string, unknown>) => http().post('/api/auth/login/2fa').send(body);

describe('two-factor: setup and enable', () => {
  let user: TestUser;
  let secret: string;
  beforeAll(async () => {
    user = await registerUser('Tess Setup');
  });

  it('needs a signed-in user', async () => {
    expect((await http().post('/api/profile/2fa/setup')).status).toBe(401);
    expect((await http().get('/api/profile/2fa')).status).toBe(401);
  });

  it('returns a base32 secret and an otpauth URL, and keeps the secret encrypted while pending', async () => {
    const res = await post('/setup', user);
    expect(res.status).toBe(200);
    secret = res.body.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(res.body.otpauthUrl).toContain('otpauth://totp/TaskMan:');
    expect(res.body.otpauthUrl).toContain(`secret=${secret}`);
    expect((await status(user)).body).toMatchObject({ enabled: false, recoveryCodesRemaining: 0 });

    const stored = await storedUser(user.email);
    expect(stored?.twoFactor.pendingSecretEncrypted).toMatch(/^v1\./);
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(stored?.twoFactor.enabled).toBe(false);
  });

  it('refuses a wrong password, a wrong code and a missing code', async () => {
    const code = nextCode(secret);
    const wrongPassword = await post('/enable', user, { code, password: 'not-the-password' });
    expect(wrongPassword.status).toBe(400);
    expect(wrongPassword.body.code).toBe('INVALID_PASSWORD');
    // A wrong password is not a session problem: it must not look like a 401 to the web app
    expect(wrongPassword.status).not.toBe(401);

    const wrongCode = await post('/enable', user, { code: code === '000000' ? '000001' : '000000', password: PASSWORD });
    expect(wrongCode.status).toBe(400);
    expect(wrongCode.body.code).toBe('INVALID_CODE');

    const noCode = await post('/enable', user, { password: PASSWORD });
    expect(noCode.status).toBe(400);
    expect((await status(user)).body.enabled).toBe(false);
  });

  it('asks for the setup first when there is no pending secret', async () => {
    const other = await registerUser('Tess NoSetup');
    const res = await post('/enable', other, { code: '123456', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SETUP_REQUIRED');
  });

  it('turns on with a valid code and returns ten recovery codes once', async () => {
    const res = await post('/enable', user, { code: nextCode(secret), password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.recoveryCodes).toHaveLength(10);
    for (const code of res.body.recoveryCodes) expect(code).toMatch(RECOVERY_SHAPE);
    expect(new Set(res.body.recoveryCodes).size).toBe(10);

    expect((await status(user)).body).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 });
    const stored = await storedUser(user.email);
    expect(stored?.twoFactor.secretEncrypted).toMatch(/^v1\./);
    expect(stored?.twoFactor.pendingSecretEncrypted).toBeUndefined();
    expect(stored?.twoFactor.recoveryCodeHashes).toHaveLength(10);
    const raw = JSON.stringify(stored);
    expect(raw).not.toContain(secret);
    for (const code of res.body.recoveryCodes) expect(raw).not.toContain(code);
    expect(stored?.twoFactor.recoveryCodeHashes[0]).toMatch(/^\$2[aby]\$/);
  });

  it('never serializes secrets or hashes with the profile', async () => {
    const profile = await http().get(profileUrl).set(bearer(user.token));
    expect(profile.status).toBe(200);
    expect(profile.body.twoFactor).toMatchObject({ enabled: true });
    expect(JSON.stringify(profile.body)).not.toMatch(/secretEncrypted|pendingSecret|recoveryCodeHashes|lastUsedStep/);
  });

  it('refuses to start again while on', async () => {
    const res = await post('/setup', user);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_ENABLED');
  });
});

describe('two-factor: sign-in', () => {
  let user: TestUser;
  let secret: string;
  let recoveryCodes: string[];
  beforeAll(async () => {
    user = await registerUser('Lena Login');
    ({ secret, recoveryCodes } = await enableTwoFactor(user));
  });

  it('answers the password step with a challenge and no session', async () => {
    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect(res.body.twoFactorRequired).toBe(true);
    expect(typeof res.body.challenge).toBe('string');
    expect(res.body.token).toBeUndefined();
    const claims = jwt.decode(res.body.challenge) as { purpose: string; exp: number; iat: number };
    expect(claims.purpose).toBe('2fa');
    expect(claims.exp - claims.iat).toBe(300);
    // A wrong password still looks the same as always
    expect((await login(user.email, 'wrong-password')).status).toBe(401);
  });

  it('rejects a wrong code and counts down the attempts', async () => {
    const challenge = await startLogin(user);
    const first = await secondStep({ challenge, code: '000000' });
    expect(first.status).toBe(401);
    expect(first.body).toMatchObject({ code: 'INVALID_CODE', attemptsLeft: 4 });
    const second = await secondStep({ challenge, code: '999999' });
    expect(second.body.attemptsLeft).toBe(3);
    // The right code still works afterwards
    const ok = await secondStep({ challenge, code: nextCode(secret) });
    expect(ok.status).toBe(200);
  });

  it('completes the sign-in once and the session works', async () => {
    const challenge = await startLogin(user);
    const code = nextCode(secret);
    const res = await secondStep({ challenge, code });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: user.email, name: user.name });
    expect(typeof res.body.token).toBe('string');
    expect((await http().get(profileUrl).set(bearer(res.body.token))).status).toBe(200);

    // The challenge is single use
    const again = await secondStep({ challenge, code: nextCode(secret) });
    expect(again.status).toBe(401);
    expect(again.body.code).toBe('CHALLENGE_EXPIRED');
  });

  it('refuses to accept the same code twice (replay), even on a new challenge', async () => {
    const first = await startLogin(user);
    const code = nextCode(secret);
    expect((await secondStep({ challenge: first, code })).status).toBe(200);

    const second = await startLogin(user);
    const replay = await secondStep({ challenge: second, code });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('INVALID_CODE');
    // a code from the next step is fine
    expect((await secondStep({ challenge: second, code: nextCode(secret) })).status).toBe(200);
  });

  it('allows only one of two parallel requests with the same code', async () => {
    const a = await startLogin(user);
    const b = await startLogin(user);
    // Starting a sign-in replaces the earlier challenge of the account
    expect((await secondStep({ challenge: a, code: nextCode(secret) })).status).toBe(401);
    const code = nextCode(secret);
    const results = await Promise.all([secondStep({ challenge: b, code }), secondStep({ challenge: b, code })]);
    expect(results.map(res => res.status).sort()).toEqual([200, 401]);
  });

  it('rejects forged, expired or foreign challenges', async () => {
    const code = nextCode(secret);
    expect((await secondStep({ code })).status).toBe(401);
    expect((await secondStep({ challenge: 'nonsense', code })).status).toBe(401);
    expect((await secondStep({ challenge: { $gt: '' }, code })).status).toBe(401);

    // Signed with the session key instead of the challenge key
    const forged = jwt.sign({ id: user.id, purpose: '2fa', nonce: 'abc' }, process.env.JWT_SECRET as string, { expiresIn: 300 });
    expect((await secondStep({ challenge: forged, code })).status).toBe(401);

    // A session token is not a challenge
    expect((await secondStep({ challenge: user.token, code })).status).toBe(401);

    // A real challenge with no code is a bad request, not a failed attempt
    const open = await startLogin(user);
    expect((await secondStep({ challenge: open, code: '' })).status).toBe(400);
    expect((await secondStep({ challenge: open, code: nextCode(secret) })).status).toBe(200);
  });

  it('accepts a recovery code once and tells how many are left', async () => {
    const [recovery, other] = recoveryCodes;
    const challenge = await startLogin(user);
    const res = await secondStep({ challenge, recoveryCode: recovery.toUpperCase() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ usedRecoveryCode: true, recoveryCodesRemaining: 9 });
    expect((await status(user)).body.recoveryCodesRemaining).toBe(9);

    const second = await startLogin(user);
    const reuse = await secondStep({ challenge: second, recoveryCode: recovery });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('INVALID_CODE');
    // another code still works, written without the dash
    const fine = await secondStep({ challenge: second, recoveryCode: other.replace('-', '') });
    expect(fine.status).toBe(200);
    expect((await status(user)).body.recoveryCodesRemaining).toBe(8);
  });

  it('deletes the challenge after five wrong codes, even if the right code follows', async () => {
    const lockUser = await registerUser('Lock Lena');
    const { secret: lockSecret } = await enableTwoFactor(lockUser);
    const challenge = await startLogin(lockUser);
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await secondStep({ challenge, code: '000000' });
      expect(res.body.attemptsLeft).toBe(5 - attempt);
    }
    const fifth = await secondStep({ challenge, code: '000000' });
    expect(fifth.status).toBe(401);
    expect(fifth.body.code).toBe('CHALLENGE_LOCKED');

    const right = await secondStep({ challenge, code: nextCode(lockSecret) });
    expect(right.status).toBe(401);
    expect(right.body.code).toBe('CHALLENGE_EXPIRED');
  });

  it('pauses second-step attempts on the account after repeated failures across challenges', async () => {
    const lockUser = await registerUser('Pause Pam');
    const { secret: lockSecret } = await enableTwoFactor(lockUser);
    // 5 wrong codes in total over several challenges (each challenge gives at most 4 here)
    for (let round = 0; round < 2; round++) {
      const challenge = await startLogin(lockUser);
      const tries = round === 0 ? 3 : 2;
      for (let attempt = 0; attempt < tries; attempt++) await secondStep({ challenge, code: '000000' });
    }
    const challenge = await startLogin(lockUser);
    const locked = await secondStep({ challenge, code: nextCode(lockSecret) });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('TWO_FACTOR_LOCKED');
    expect((await storedUser(lockUser.email))?.twoFactor.lockedUntil).toBeDefined();
  });
});

describe('two-factor: recovery codes and disabling', () => {
  let user: TestUser;
  let secret: string;
  let recoveryCodes: string[];
  beforeAll(async () => {
    user = await registerUser('Dana Disable');
    ({ secret, recoveryCodes } = await enableTwoFactor(user));
  });

  it('regenerates the codes with the password and a current code, and the old ones stop working', async () => {
    const wrongPassword = await post('/recovery-codes', user, { password: 'nope', code: nextCode(secret) });
    expect(wrongPassword.status).toBe(400);
    const wrongCode = await post('/recovery-codes', user, { password: PASSWORD, code: '000000' });
    expect(wrongCode.status).toBe(400);
    // A recovery code cannot be used to make new ones
    const withRecovery = await post('/recovery-codes', user, { password: PASSWORD, recoveryCode: recoveryCodes[0] });
    expect(withRecovery.status).toBe(400);

    const res = await post('/recovery-codes', user, { password: PASSWORD, code: nextCode(secret) });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    expect(res.body.recoveryCodes.some((code: string) => recoveryCodes.includes(code))).toBe(false);

    const challenge = await startLogin(user);
    expect((await secondStep({ challenge, recoveryCode: recoveryCodes[1] })).status).toBe(401);
    expect((await secondStep({ challenge, recoveryCode: res.body.recoveryCodes[0] })).status).toBe(200);
    recoveryCodes = res.body.recoveryCodes;
  });

  it('refuses to disable without the password or a second factor', async () => {
    expect((await post('/disable', user, { password: 'nope', code: nextCode(secret) })).status).toBe(400);
    expect((await post('/disable', user, { password: PASSWORD })).status).toBe(400);
    expect((await post('/disable', user, { password: PASSWORD, code: '000000' })).status).toBe(400);
    expect((await status(user)).body.enabled).toBe(true);
  });

  it('turns off with the password and a recovery code, and sign-in is plain again', async () => {
    const res = await post('/disable', user, { password: PASSWORD, recoveryCode: recoveryCodes[3] });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);

    const stored = await storedUser(user.email);
    expect(stored?.twoFactor.enabled).toBe(false);
    expect(stored?.twoFactor.secretEncrypted).toBeUndefined();
    expect(stored?.twoFactor.recoveryCodeHashes).toBeUndefined();

    const plain = await login(user.email);
    expect(plain.status).toBe(200);
    expect(plain.body.twoFactorRequired).toBeUndefined();
    expect(typeof plain.body.token).toBe('string');

    expect((await post('/disable', user, { password: PASSWORD, code: '123456' })).body.code).toBe('NOT_ENABLED');
  });

  it('turns off with an authenticator code too', async () => {
    const again = await registerUser('Dana Again');
    const enabled = await enableTwoFactor(again);
    const res = await post('/disable', again, { password: PASSWORD, code: nextCode(enabled.secret) });
    expect(res.status).toBe(200);
  });
});

describe('two-factor: API tokens', () => {
  it('cannot reach any two-factor endpoint', async () => {
    const team = await createTeam();
    const slug = team.workspace.slug;
    const created = await http().post(`/api/workspaces/${slug}/tokens`).set(bearer(team.owner.token))
      .send({ name: 'CI', scopes: ['tasks:read'] });
    expect(created.status).toBe(201);
    const token = created.body.token as string;

    // The workspace slug lets the token past authentication, so the endpoint's own check is what answers
    const attempts = [
      http().get(`/api/profile/2fa?workspaceSlug=${slug}`),
      http().post(`/api/profile/2fa/setup?workspaceSlug=${slug}`),
      http().post(`/api/profile/2fa/enable?workspaceSlug=${slug}`).send({ code: '123456', password: PASSWORD }),
      http().post(`/api/profile/2fa/disable?workspaceSlug=${slug}`).send({ password: PASSWORD, code: '123456' }),
      http().post(`/api/profile/2fa/recovery-codes?workspaceSlug=${slug}`).send({ password: PASSWORD, code: '123456' }),
    ];
    for (const attempt of attempts) {
      const res = await attempt.set(bearer(token));
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/API tokens/);
    }
    // And without a slug
    expect((await http().post('/api/profile/2fa/setup').set(bearer(token))).status).toBe(403);
    expect((await storedUser(team.owner.email))?.twoFactor.pendingSecretEncrypted).toBeUndefined();
  });
});

describe('two-factor: workspace policy', () => {
  let team: Awaited<ReturnType<typeof createTeam>>;
  let slug: string;
  let ownerSecret: string;
  beforeAll(async () => {
    team = await createTeam();
    slug = team.workspace.slug;
  });

  const setPolicy = (user: TestUser, require2fa: unknown) =>
    http().put(`/api/workspaces/${slug}`).set(bearer(user.token)).send({ require2fa });
  const tasks = (user: TestUser) => http().get(`/api/workspaces/${slug}/tasks`).set(bearer(user.token));

  it('is off by default and the workspace shows it', async () => {
    const res = await http().get(`/api/workspaces/${slug}`).set(bearer(team.owner.token));
    expect(res.status).toBe(200);
    expect(res.body.security?.require2fa).toBe(false);
    expect((await tasks(team.developer)).status).toBe(200);
  });

  it('cannot be turned on by someone without two-factor themselves', async () => {
    const res = await setPolicy(team.owner, true);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OWN_TWO_FACTOR_REQUIRED');
    expect((await tasks(team.developer)).status).toBe(200);
  });

  it('needs settings:manage and a real boolean', async () => {
    ({ secret: ownerSecret } = await enableTwoFactor(team.owner));
    expect((await setPolicy(team.developer, true)).status).toBe(403);
    expect((await setPolicy(team.owner, 'yes')).status).toBe(400);
    expect((await http().put(`/api/workspaces/${slug}`).set(bearer(team.owner.token)).send({})).status).toBe(400);
  });

  it('blocks members without two-factor with TWO_FACTOR_REQUIRED, and writes the audit entry', async () => {
    const res = await setPolicy(team.owner, true);
    expect(res.status).toBe(200);
    expect(res.body.security.require2fa).toBe(true);
    // Setting the same value again is not a new audit entry
    expect((await setPolicy(team.owner, true)).status).toBe(200);

    const blocked = await tasks(team.developer);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('TWO_FACTOR_REQUIRED');
    expect((await http().get(`/api/workspaces/${slug}/members`).set(bearer(team.viewer.token))).body.code).toBe('TWO_FACTOR_REQUIRED');

    // The owner has it, so nothing changes for them
    expect((await tasks(team.owner)).status).toBe(200);

    const activity = await http().get(`/api/workspaces/${slug}/activity`).set(bearer(team.owner.token));
    expect(activity.status).toBe(200);
    const entries = (activity.body.items as { action: string; changes: { field: string; from?: string; to?: string }[] }[])
      .filter(entry => entry.action === 'workspace.updated' && entry.changes.some(change => change.field === 'require2fa'));
    expect(entries).toHaveLength(1);
    expect(entries[0].changes[0]).toMatchObject({ field: 'require2fa', from: 'off', to: 'on' });
  });

  it('keeps account routes and the workspace record open so people can set it up', async () => {
    expect((await http().get(profileUrl).set(bearer(team.developer.token))).status).toBe(200);
    expect((await status(team.developer)).status).toBe(200);
    expect((await http().get(`/api/workspaces/${slug}`).set(bearer(team.developer.token))).status).toBe(200);
    expect((await http().get('/api/workspaces').set(bearer(team.developer.token))).status).toBe(200);
  });

  it('lets a member back in as soon as they turn it on', async () => {
    const { secret } = await enableTwoFactor(team.developer);
    expect((await tasks(team.developer)).status).toBe(200);

    // ... and they cannot leave two-factor while the policy needs it
    const disable = await post('/disable', team.developer, { password: PASSWORD, code: nextCode(secret) });
    expect(disable.status).toBe(409);
    expect(disable.body.code).toBe('TWO_FACTOR_REQUIRED_BY_WORKSPACE');
    expect((await status(team.developer)).body.enabled).toBe(true);
  });

  it('applies to API tokens of members without it as well', async () => {
    const created = await http().post(`/api/workspaces/${slug}/tokens`).set(bearer(team.developer.token))
      .send({ name: 'CI', scopes: ['tasks:read'] });
    expect(created.status).toBe(201);
    await mongoose.connection.collection('users').updateOne(
      { email: team.developer.email },
      { $set: { 'twoFactor.enabled': false } },
    );
    const blocked = await http().get(`/api/workspaces/${slug}/tasks`).set(bearer(created.body.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('TWO_FACTOR_REQUIRED');
    await mongoose.connection.collection('users').updateOne(
      { email: team.developer.email },
      { $set: { 'twoFactor.enabled': true } },
    );
    expect((await http().get(`/api/workspaces/${slug}/tasks`).set(bearer(created.body.token))).status).toBe(200);
  });

  it('can be turned off again, which also frees the members to leave two-factor', async () => {
    const off = await setPolicy(team.owner, false);
    expect(off.status).toBe(200);
    expect(off.body.security.require2fa).toBe(false);
    expect((await tasks(team.viewer)).status).toBe(200);

    const stored = await storedUser(team.developer.email);
    expect(stored?.twoFactor.enabled).toBe(true);
  });

  it('still renames the workspace without touching the policy', async () => {
    const renamed = await http().put(`/api/workspaces/${slug}`).set(bearer(team.owner.token))
      .send({ name: `Renamed ${crypto.randomBytes(2).toString('hex')}` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.security.require2fa).toBe(false);
    expect(ownerSecret).toMatch(/^[A-Z2-7]{32}$/);
  });
});
