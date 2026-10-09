import mongoose from 'mongoose';
import {
  PASSWORD, bearer, emailsTo, http, latestToken, login, registerUser, startApp, stopApp, uniqueEmail,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

const NEW_PASSWORD = 'An0ther-strong-pw';
const forgot = (email: unknown) => http().post('/api/auth/forgot-password').send({ email });
const reset = (token: string, password: unknown) =>
  http().post(`/api/auth/reset-password/${token}`).send({ password });

describe('forgot / reset password', () => {
  it('gives the same generic answer for unknown accounts and sends nothing', async () => {
    const email = uniqueEmail('nobody');
    const res = await forgot(email);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    expect(emailsTo(email)).toHaveLength(0);
  });

  it('rejects a malformed email', async () => {
    expect((await forgot('nope')).status).toBe(400);
    expect((await forgot({ $gt: '' })).status).toBe(400);
  });

  it('runs the full flow: link by email, new password, old sessions revoked', async () => {
    const user = await registerUser('Reset Flow');
    // A second session, logged in "later" so its JWT differs from the first
    const realNow = Date.now.bind(Date);
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + 5000);
    const other = await login(user.email);
    spy.mockRestore();
    expect(other.status).toBe(200);

    const generic = await forgot(user.email);
    expect(generic.status).toBe(200);
    const token = latestToken(user.email, 'reset-password');
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    // password rules and unknown tokens
    expect((await reset(token!, 'short')).status).toBe(400);
    expect((await reset(token!, { $gt: '' })).status).toBe(400);
    expect((await reset('0'.repeat(64), NEW_PASSWORD)).status).toBe(400);

    const done = await reset(token!, NEW_PASSWORD);
    expect(done.status).toBe(200);

    // every existing session is gone
    expect((await http().get('/api/auth/currentuser').set(bearer(user.token))).status).toBe(401);
    expect((await http().get('/api/auth/currentuser').set(bearer(other.body.token))).status).toBe(401);

    // old password dead, new password works, link is single use
    expect((await login(user.email, PASSWORD)).status).toBe(401);
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    expect((await reset(token!, 'Third-password-1')).status).toBe(400);
  });

  it('rejects an expired reset token', async () => {
    const user = await registerUser('Reset Expired');
    await forgot(user.email);
    const token = latestToken(user.email, 'reset-password')!;
    await mongoose.connection.collection('users').updateOne(
      { email: user.email },
      { $set: { resetPasswordExpires: new Date(Date.now() - 1000) } },
    );
    expect((await reset(token, NEW_PASSWORD)).status).toBe(400);
    // the password did not change
    expect((await login(user.email, PASSWORD)).status).toBe(200);
  });

  it('only honours the most recent reset link', async () => {
    const user = await registerUser('Reset Twice');
    await forgot(user.email);
    const first = latestToken(user.email, 'reset-password')!;
    await forgot(user.email);
    const second = latestToken(user.email, 'reset-password')!;
    expect(second).not.toBe(first);
    expect((await reset(first, NEW_PASSWORD)).status).toBe(400);
    expect((await reset(second, NEW_PASSWORD)).status).toBe(200);
  });
});
