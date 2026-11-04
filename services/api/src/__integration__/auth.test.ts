import {
  PASSWORD, bearer, emailsTo, http, latestToken, login, registerUser, signup, signupVerified,
  startApp, stopApp, uniqueEmail,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

describe('auth: signup validation', () => {
  it('rejects a password shorter than 8 characters', async () => {
    const res = await signup({ name: 'Short', email: uniqueEmail('short'), password: '1234567' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.errors)).toMatch(/at least 8/);
  });

  it('accepts a password of exactly 8 characters', async () => {
    const res = await signup({ name: 'Edge', email: uniqueEmail('edge'), password: '12345678' });
    expect(res.status).toBe(201);
  });

  it('rejects an invalid email', async () => {
    const res = await signup({ name: 'Bad Email', email: 'not-an-email', password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it('rejects a missing name', async () => {
    const res = await signup({ email: uniqueEmail('noname'), password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it('rejects a non-string password (operator payload or number)', async () => {
    const asObject = await signup({ name: 'Obj', email: uniqueEmail('obj'), password: { $gt: '' } });
    const asNumber = await signup({ name: 'Num', email: uniqueEmail('num'), password: 123456789 });
    expect(asObject.status).toBe(400);
    expect(asNumber.status).toBe(400);
  });

  it('creates an unverified account without leaking the password or tokens', async () => {
    const email = uniqueEmail('created');
    const res = await signup({ name: 'Created', email, password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email, name: 'Created', requiresVerification: true });
    expect(JSON.stringify(res.body)).not.toMatch(/password|verificationToken/i);
    expect(emailsTo(email)).toHaveLength(1);
  });

  it('normalizes the email to lowercase and treats it case-insensitively', async () => {
    const local = uniqueEmail('mixed').replace('@example.com', '');
    const res = await signup({ name: 'Mixed', email: `${local.toUpperCase()}@EXAMPLE.COM`, password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(`${local}@example.com`);

    const again = await signup({ name: 'Mixed Again', email: `${local}@example.com`, password: PASSWORD });
    expect(again.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    const email = uniqueEmail('dup');
    expect((await signup({ name: 'First', email, password: PASSWORD })).status).toBe(201);
    const second = await signup({ name: 'Second', email, password: PASSWORD });
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already exists/i);
  });

  // User.name has maxlength 80 but validateSignup has no length rule -> ValidationError -> 500
  it('rejects a name longer than the 80 character limit with a 400, not a 500', async () => {
    const res = await signup({ name: 'x'.repeat(81), email: uniqueEmail('longname'), password: PASSWORD });
    expect(res.status).toBe(400);
  });

  // validateSignup runs .trim().escape() on the name, so it is stored HTML-escaped and
  // every React screen then renders the literal text "O&#x27;Brien".
  it('stores a name with an apostrophe unchanged (no double escaping)', async () => {
    const user = await signupVerified("Conan O'Brien");
    const session = await login(user.email);
    const profile = await http().get('/api/profile').set(bearer(session.body.token));
    expect(profile.body.name).toBe("Conan O'Brien");
  });
});

describe('auth: verification and login', () => {
  const email = uniqueEmail('flow');
  let token = '';

  it('blocks login before the email is verified (403)', async () => {
    expect((await signup({ name: 'Flow', email, password: PASSWORD })).status).toBe(201);
    const res = await login(email);
    expect(res.status).toBe(403);
    expect(res.body.requiresVerification).toBe(true);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects an unknown or malformed verification token', async () => {
    expect((await http().get(`/api/auth/verify-email/${'0'.repeat(64)}`)).status).toBe(400);
    expect((await http().get('/api/auth/verify-email/garbage')).status).toBe(400);
  });

  it('verifies the account through the emailed link and the link is single use', async () => {
    const link = latestToken(email, 'verify-email');
    expect(link).toMatch(/^[a-f0-9]{64}$/);
    expect((await http().get(`/api/auth/verify-email/${link}`)).status).toBe(200);
    expect((await http().get(`/api/auth/verify-email/${link}`)).status).toBe(400);
  });

  it('logs in after verification and returns a token without sensitive fields', async () => {
    const res = await login(email);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body).toMatchObject({ email, onboardingComplete: false, activeWorkspaceSlug: null });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    token = res.body.token;
  });

  it('accepts the e-mail in a different case', async () => {
    const res = await login(email.toUpperCase());
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password and an unknown account with the same 401', async () => {
    const wrong = await login(email, 'definitely-wrong');
    const unknown = await login(uniqueEmail('ghost'));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('rejects NoSQL operator payloads on login', async () => {
    const operators = await http().post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    const passwordOperator = await http().post('/api/auth/login').send({ email, password: { $ne: null } });
    const missing = await http().post('/api/auth/login').send({ email });
    expect(operators.status).toBe(401);
    expect(passwordOperator.status).toBe(401);
    expect(missing.status).toBe(401);
  });

  it('serves currentuser for a valid token only', async () => {
    const ok = await http().get('/api/auth/currentuser').set(bearer(token));
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email);
    expect(ok.body.workspace).toBeNull();
    expect(ok.body.permissions).toEqual([]);

    expect((await http().get('/api/auth/currentuser')).status).toBe(401);
    expect((await http().get('/api/auth/currentuser').set(bearer('not.a.jwt'))).status).toBe(401);
    expect((await http().get('/api/auth/currentuser').set({ Authorization: token })).status).toBe(401);
  });
});

/** Logs in with the clock moved forward, so the JWT (second resolution `iat`) differs. */
const loginAtOffset = async (email: string, offsetMs: number) => {
  const realNow = Date.now.bind(Date);
  const spy = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offsetMs);
  try {
    return await login(email);
  } finally {
    spy.mockRestore();
  }
};

describe('auth: logout', () => {
  it('invalidates only the session that logged out', async () => {
    const user = await registerUser('Logout');
    const second = await loginAtOffset(user.email, 5000);
    expect(second.status).toBe(200);
    expect(second.body.token).not.toBe(user.token);

    const out = await http().post('/api/auth/logout').set(bearer(user.token));
    expect(out.status).toBe(200);

    expect((await http().get('/api/auth/currentuser').set(bearer(user.token))).status).toBe(401);
    expect((await http().get('/api/auth/currentuser').set(bearer(second.body.token))).status).toBe(200);
  });

  // generateToken signs only { id } (no jti), so two logins in the same second yield the SAME
  // token; logout then flips just one of the two identical session rows and the token stays valid.
  it('logout kills the token even when two logins happened in the same second', async () => {
    const user = await registerUser('Logout Twice');
    const realNow = Date.now.bind(Date);
    const frozen = realNow();
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => frozen);
    let first;
    try {
      first = await login(user.email);
      // A second login in the same second gives the same token
      await login(user.email);
    } finally {
      spy.mockRestore();
    }
    await http().post('/api/auth/logout').set(bearer(first.body.token));
    expect((await http().get('/api/auth/currentuser').set(bearer(first.body.token))).status).toBe(401);
  });

  it('requires authentication', async () => {
    expect((await http().post('/api/auth/logout')).status).toBe(401);
  });
});

describe('auth: onboarding', () => {
  it('creates the first workspace as Product Owner and is idempotent', async () => {
    const user = await registerUser('Onboard');
    const first = await http()
      .post('/api/auth/onboarding')
      .set(bearer(user.token))
      .send({ role: 'dev', useCase: 'work', teamSize: '2-5', workspaceName: 'Onboard HQ' });
    expect(first.status).toBe(200);
    expect(first.body.workspace.slug).toBe('onboard-hq');
    expect(first.body.onboarding.completedAt).toBeTruthy();

    const again = await http()
      .post('/api/auth/onboarding')
      .set(bearer(user.token))
      .send({ workspaceName: 'Another One' });
    expect(again.status).toBe(200);
    expect(again.body.workspace._id).toBe(first.body.workspace._id);

    const me = await http().get('/api/auth/currentuser').set(bearer(user.token));
    expect(me.body.role.name).toBe('Product Owner');
    expect(me.body.workspace.slug).toBe('onboard-hq');
    expect(me.body.actions).toEqual(expect.arrayContaining(['read', 'create', 'update', 'delete', 'manage']));
  });

  it('requires authentication', async () => {
    expect((await http().post('/api/auth/onboarding').send({})).status).toBe(401);
  });

  it('defaults the workspace name from the user name', async () => {
    const user = await registerUser('Default Name');
    const res = await http().post('/api/auth/onboarding').set(bearer(user.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.workspace.name).toBe("Default Name's Workspace");
  });

  // saveOnboarding calls workspaceName.trim() unguarded -> TypeError -> 500
  it('rejects a non-string workspaceName with a 400, not a 500', async () => {
    const user = await registerUser('Bad Onboard');
    const res = await http().post('/api/auth/onboarding').set(bearer(user.token)).send({ workspaceName: { a: 1 } });
    expect(res.status).toBe(400);
  });

  // Workspace.name has maxlength 60; the ValidationError is not mapped -> 500
  it('rejects a workspaceName over 60 characters with a 400, not a 500', async () => {
    const user = await registerUser('Long Onboard');
    const res = await http().post('/api/auth/onboarding').set(bearer(user.token)).send({ workspaceName: 'w'.repeat(100) });
    expect(res.status).toBe(400);
  });
});
