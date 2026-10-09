import {
  PASSWORD, bearer, http, login, registerUser, startApp, stopApp, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

const profile = (user: TestUser) => http().get('/api/profile').set(bearer(user.token));
const update = (user: TestUser, body: Record<string, unknown>) =>
  http().put('/api/profile').set(bearer(user.token)).send(body);

describe('profile', () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await registerUser('Profile Person');
  });

  it('requires authentication', async () => {
    expect((await http().get('/api/profile')).status).toBe(401);
    expect((await http().put('/api/profile').send({ name: 'x' })).status).toBe(401);
  });

  it('returns the profile without secrets', async () => {
    const res = await profile(user);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Profile Person', email: user.email, theme: 'system', language: 'en' });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/"password"/);
    expect(text).not.toMatch(/verificationToken|resetPasswordToken/);
  });

  it('updates only the allowed fields and trims values', async () => {
    const res = await update(user, {
      name: '  Renamed  ',
      bio: 'Hello',
      jobTitle: 'Engineer',
      phone: '+1 555 0100',
      timezone: 'Europe/Paris',
      language: 'fr',
      theme: 'dark',
      email: 'hijack@example.com',
      isVerified: false,
      password: 'plain',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Renamed', bio: 'Hello', theme: 'dark', timezone: 'Europe/Paris' });
    expect(res.body.email).toBe(user.email);
    expect(res.body.isVerified).toBe(true);
    // the password was not overwritten
    expect((await login(user.email, PASSWORD)).status).toBe(200);
  });

  it('accepts partial updates and leaves other fields alone', async () => {
    const res = await update(user, { bio: 'Only the bio' });
    expect(res.status).toBe(200);
    expect(res.body.bio).toBe('Only the bio');
    expect(res.body.name).toBe('Renamed');
  });

  it('rejects non-string values and over-long fields', async () => {
    expect((await update(user, { name: { $set: 'x' } })).status).toBe(400);
    expect((await update(user, { bio: 'b'.repeat(281) })).status).toBe(400);
    expect((await update(user, { name: 'n'.repeat(81) })).status).toBe(400);
    expect((await update(user, { phone: '1'.repeat(31) })).status).toBe(400);
    expect((await update(user, { avatarUrl: `https://example.com/${'a'.repeat(500)}` })).status).toBe(400);
  });

  // findByIdAndUpdate runs validators; the enum ValidationError is not mapped -> 500
  it('rejects an invalid theme enum value with a 400, not a 500', async () => {
    expect((await update(user, { theme: 'neon' })).status).toBe(400);
  });

  it('only allows http(s) avatar URLs', async () => {
    for (const avatarUrl of ['javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', 'ftp://example.com/a.png', '//evil.test/a.png']) {
      expect((await update(user, { avatarUrl })).status).toBe(400);
    }
    const ok = await update(user, { avatarUrl: 'https://cdn.example.com/me.png' });
    expect(ok.status).toBe(200);
    expect(ok.body.avatarUrl).toBe('https://cdn.example.com/me.png');
    const cleared = await update(user, { avatarUrl: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.avatarUrl).toBe('');
  });

  it('updates notification preferences', async () => {
    const res = await http()
      .put('/api/profile/notifications')
      .set(bearer(user.token))
      .send({ email: false, taskAssigned: false, taskCompleted: true, weeklyDigest: false });
    expect(res.status).toBe(200);
    expect(res.body.notifications).toMatchObject({ email: false, taskAssigned: false, taskCompleted: true, weeklyDigest: false });
  });

  it('keeps the other preferences when only one is sent', async () => {
    const other = await registerUser('Prefs Partial');
    const res = await http().put('/api/profile/notifications').set(bearer(other.token)).send({ email: false });
    expect(res.status).toBe(200);
    const stored = (await profile(other)).body.notifications;
    expect(stored).toMatchObject({ email: false, taskAssigned: true, taskCompleted: false, weeklyDigest: true });
  });

  // Boolean cast error on the notifications sub-document -> 500
  it('rejects non-boolean notification values with a 400, not a 500', async () => {
    const res = await http()
      .put('/api/profile/notifications')
      .set(bearer(user.token))
      .send({ email: 'sometimes', taskAssigned: true, taskCompleted: true, weeklyDigest: true });
    expect(res.status).toBe(400);
  });
});

describe('change password', () => {
  const NEXT = 'Brand-new-pass1';
  const change = (user: TestUser, body: Record<string, unknown>) =>
    http().put('/api/profile/password').set(bearer(user.token)).send(body);

  it('validates the input', async () => {
    const user = await registerUser('Pw Validation');
    expect((await change(user, {})).status).toBe(400);
    expect((await change(user, { currentPassword: PASSWORD })).status).toBe(400);
    expect((await change(user, { currentPassword: PASSWORD, newPassword: 'short' })).status).toBe(400);
    expect((await change(user, { currentPassword: { $ne: '' }, newPassword: NEXT })).status).toBe(400);
    expect((await change(user, { currentPassword: 'wrong-wrong', newPassword: NEXT })).status).toBe(401);
    expect((await http().put('/api/profile/password').send({ currentPassword: PASSWORD, newPassword: NEXT })).status).toBe(401);
  });

  it('keeps the current session but revokes every other one', async () => {
    const user = await registerUser('Pw Change');
    const realNow = Date.now.bind(Date);
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + 5000);
    const otherDevice = await login(user.email);
    spy.mockRestore();
    expect(otherDevice.body.token).not.toBe(user.token);

    const res = await change(user, { currentPassword: PASSWORD, newPassword: NEXT });
    expect(res.status).toBe(200);

    expect((await http().get('/api/auth/currentuser').set(bearer(user.token))).status).toBe(200);
    expect((await http().get('/api/auth/currentuser').set(bearer(otherDevice.body.token))).status).toBe(401);

    expect((await login(user.email, PASSWORD)).status).toBe(401);
    expect((await login(user.email, NEXT)).status).toBe(200);
  });
});
