import { http, startApp, stopApp } from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

describe('platform: health and unknown routes', () => {
  it('reports health without authentication', async () => {
    const res = await http().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'OK', message: 'Server is running', database: 'up', version: expect.any(String) });
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
  });

  it('answers 404 for unknown routes without leaking the stack or framework', async () => {
    for (const path of ['/api/nope', '/', '/api/workspaces/x/unknown/deep', '/api/auth/unknown']) {
      const res = await http().get(path);
      expect(res.status).toBe(404);
      expect(res.text).not.toMatch(/at .*\.(ts|js):\d+/);
    }
    expect((await http().post('/api/health')).status).toBe(404);
    expect((await http().delete('/api/auth/login')).status).toBe(404);
  });

  it('rejects protected routes without a token', async () => {
    for (const path of ['/api/profile', '/api/workspaces', '/api/auth/currentuser', '/api/roles/permissions']) {
      expect([path, (await http().get(path)).status]).toEqual([path, 401]);
    }
  });

  it('refuses malformed Authorization headers', async () => {
    for (const header of ['Bearer', 'Bearer ', 'Basic abc', 'bearer abc', 'Bearer a.b.c']) {
      const res = await http().get('/api/profile').set('Authorization', header);
      expect([header, res.status]).toEqual([header, 401]);
    }
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const res = await http().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
  });
});

describe('platform: security headers (helmet)', () => {
  it('sets the standard hardening headers and hides x-powered-by', async () => {
    const res = await http().get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
  });

  it('also sets them on error responses', async () => {
    const res = await http().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('platform: CORS allow-list', () => {
  it('echoes an allowed origin', async () => {
    const res = await http().get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not grant an unknown origin', async () => {
    for (const origin of ['http://evil.example', 'http://localhost:5174', 'https://localhost:5173', 'null']) {
      const res = await http().get('/api/health').set('Origin', origin);
      expect([origin, res.headers['access-control-allow-origin']]).toEqual([origin, undefined]);
    }
  });

  it('answers the preflight for an allowed origin only', async () => {
    const ok = await http()
      .options('/api/workspaces')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-headers']).toMatch(/authorization/i);

    const blocked = await http()
      .options('/api/workspaces')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never allows credentials-wildcard combinations', async () => {
    const res = await http().get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});

describe('platform: rate limiting', () => {
  it('limits repeated login attempts per IP (429 after 20 requests)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 24; i++) {
      const res = await http().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever-pw' });
      statuses.push(res.status);
    }
    const firstLimited = statuses.indexOf(429);
    // 20 allowed per window (a few requests of earlier tests in this file count too)
    expect(firstLimited).toBeGreaterThanOrEqual(15);
    expect(firstLimited).toBeLessThanOrEqual(20);
    expect(statuses.slice(0, firstLimited).every(status => status === 401)).toBe(true);
    expect(statuses.slice(firstLimited).every(status => status === 429)).toBe(true);
    const res = await http().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'x' });
    expect(res.status).toBe(429);
    expect(res.headers['ratelimit-limit'] ?? res.headers['ratelimit']).toBeDefined();
    // read-only calls on the same prefix are still served
    expect((await http().get('/api/health')).status).toBe(200);
  });
});
