import { bearer, http, login, registerUser, startApp, stopApp, type TestUser } from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

let user: TestUser;
beforeAll(async () => {
  user = await registerUser('Session Sam');
});

const newDeviceToken = async () => {
  const res = await login(user.email, user.password).set('User-Agent', 'Mozilla/5.0 (iPhone) Mobile Safari');
  expect(res.status).toBe(200);
  return res.body.token as string;
};

describe('signed-in devices', () => {
  it('lists active sessions with the current one first and no token data', async () => {
    const phone = await newDeviceToken();
    const res = await http().get('/api/profile/sessions').set(bearer(phone));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).toMatchObject({ current: true, userAgent: expect.stringContaining('iPhone') });
    expect(res.body.filter((session: { current: boolean }) => session.current)).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('"token"');
  });

  it('revokes one device, which can no longer call the API', async () => {
    const other = await newDeviceToken();
    // The device's own list marks its session as current: revoke exactly that one from the laptop
    const seenByOther = await http().get('/api/profile/sessions').set(bearer(other));
    const target = seenByOther.body.find((session: { current: boolean }) => session.current);

    const revoked = await http().delete(`/api/profile/sessions/${target._id}`).set(bearer(user.token));
    expect(revoked.status).toBe(200);
    expect((await http().get('/api/profile').set(bearer(other))).status).toBe(401);
    expect((await http().get('/api/profile').set(bearer(user.token))).status).toBe(200);

    expect((await http().delete(`/api/profile/sessions/${target._id}`).set(bearer(user.token))).status).toBe(404);
    expect((await http().delete('/api/profile/sessions/not-an-id').set(bearer(user.token))).status).toBe(404);
  });

  it('signs out every other device but keeps the current one', async () => {
    const phone = await newDeviceToken();
    const res = await http().post('/api/profile/sessions/revoke-others').set(bearer(user.token));
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBeGreaterThanOrEqual(1);

    expect((await http().get('/api/profile').set(bearer(phone))).status).toBe(401);
    expect((await http().get('/api/profile').set(bearer(user.token))).status).toBe(200);
    const list = await http().get('/api/profile/sessions').set(bearer(user.token));
    expect(list.body).toHaveLength(1);
  });

  it("cannot see or revoke another user's sessions", async () => {
    const stranger = await registerUser('Stranger Sue');
    const mine = await http().get('/api/profile/sessions').set(bearer(user.token));
    const res = await http().delete(`/api/profile/sessions/${mine.body[0]._id}`).set(bearer(stranger.token));
    expect(res.status).toBe(404);
    expect((await http().get('/api/profile/sessions')).status).toBe(401);
  });
});
