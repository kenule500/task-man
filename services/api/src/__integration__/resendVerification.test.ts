import {
  PASSWORD, emailsTo, http, latestToken, login, registerUser, signup, startApp, stopApp, uniqueEmail,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

const resend = (email: unknown) => http().post('/api/auth/resend-verification').send({ email });

describe('resend verification', () => {
  it('answers identically for unknown, verified and unverified accounts', async () => {
    const verified = await registerUser('Already Verified');
    const unverifiedEmail = uniqueEmail('pending');
    expect((await signup({ name: 'Pending', email: unverifiedEmail, password: PASSWORD })).status).toBe(201);
    const firstLink = latestToken(unverifiedEmail, 'verify-email')!;
    const ghost = uniqueEmail('ghost');

    const unknownRes = await resend(ghost);
    const verifiedRes = await resend(verified.email);
    const pendingRes = await resend(unverifiedEmail);

    for (const res of [unknownRes, verifiedRes, pendingRes]) expect(res.status).toBe(200);
    expect(unknownRes.body).toEqual(verifiedRes.body);
    expect(unknownRes.body).toEqual(pendingRes.body);

    expect(emailsTo(ghost)).toHaveLength(0);
    // registerUser already consumed the one verification mail: verified accounts get no second one
    expect(emailsTo(verified.email)).toHaveLength(1);
    expect(emailsTo(unverifiedEmail)).toHaveLength(2);

    // the fresh link replaces the first one
    const secondLink = latestToken(unverifiedEmail, 'verify-email')!;
    expect(secondLink).not.toBe(firstLink);
    expect((await http().get(`/api/auth/verify-email/${firstLink}`)).status).toBe(400);
    expect((await http().get(`/api/auth/verify-email/${secondLink}`)).status).toBe(200);
    expect((await login(unverifiedEmail)).status).toBe(200);
  });

  it('rejects a malformed email', async () => {
    expect((await resend('nope')).status).toBe(400);
    expect((await resend({ $ne: null })).status).toBe(400);
  });
});
