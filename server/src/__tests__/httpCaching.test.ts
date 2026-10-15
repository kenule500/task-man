import request from 'supertest';

jest.mock('dotenv/config', () => ({}));

// The app only needs these three collaborators to be inert; no database is touched
jest.mock('../config/env.js', () => ({
  getConfig: () => ({ trustProxy: 0, corsOrigins: ['http://localhost:5173'], rateLimitMax: 1000 }),
}));
jest.mock('../config/db.js', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/seedRoles.js', () => ({
  seedSystemRoles: jest.fn().mockResolvedValue(undefined),
  repairMemberRoles: jest.fn().mockResolvedValue(undefined),
}));

import app from '../app.js';

describe('HTTP caching headers', () => {
  it('uses weak ETags so unchanged responses can be answered with 304', () => {
    expect(app.get('etag')).toBe('weak');
  });

  it('marks API responses private and always revalidated', async () => {
    // Unauthenticated, so the guard answers 401; the header is set before any router runs
    const res = await request(app).get('/api/profile');
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('never caches the health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers a repeated JSON GET with 304 when the ETag matches', async () => {
    const first = await request(app).get('/api/health');
    expect(first.headers.etag).toMatch(/^W\//);
    // health is no-store but still carries an ETag; a matching If-None-Match is a 304
    const second = await request(app).get('/api/health').set('If-None-Match', first.headers.etag);
    expect(second.status).toBe(304);
  });
});
