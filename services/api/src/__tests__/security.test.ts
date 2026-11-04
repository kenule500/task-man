import { Request } from 'express';
import { validationResult } from 'express-validator';
import { readConfig } from '../config/env.js';
import { createSecureToken, getBearerToken, hashToken } from '../utils/tokens.js';
import { validateLogin, validateSignup } from '../controllers/authController.js';

const STRONG_SECRET = 'a'.repeat(16) + 'b'.repeat(16);

describe('readConfig', () => {
  const base = { MONGO_URI: 'mongodb://127.0.0.1:27017/test', JWT_SECRET: STRONG_SECRET };

  it('accepts a complete development environment with safe defaults', () => {
    const { config, errors, warnings } = readConfig(base);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(config).toMatchObject({
      isProduction: false,
      port: 5000,
      clientUrl: 'http://localhost:5173',
      corsOrigins: ['http://localhost:5173'],
      rateLimitMax: 500,
      trustProxy: 0,
    });
  });

  it('requires a database URI and a JWT secret', () => {
    const { errors } = readConfig({});
    expect(errors).toEqual(expect.arrayContaining(['MONGO_URI is required.', 'JWT_SECRET is required.']));
  });

  it('only warns about a weak secret in development', () => {
    const { errors, warnings } = readConfig({ ...base, JWT_SECRET: 'supersecretkey' });
    expect(errors).toEqual([]);
    expect(warnings[0]).toMatch(/JWT_SECRET is weak/);
  });

  it('refuses weak secrets and a missing CLIENT_URL in production', () => {
    const { errors } = readConfig({ ...base, NODE_ENV: 'production', JWT_SECRET: 'short' });
    expect(errors.join(' ')).toMatch(/JWT_SECRET is weak/);
    expect(errors.join(' ')).toMatch(/CLIENT_URL is required/);
  });

  it('uses the Vercel production domain when CLIENT_URL is not set', () => {
    const { config, errors } = readConfig({ ...base, NODE_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'taskman.example.app' });
    expect(errors).toEqual([]);
    expect(config.clientUrl).toBe('https://taskman.example.app');
    expect(config.corsOrigins).toEqual(['https://taskman.example.app']);
  });

  it('parses a comma separated CORS allow-list without trailing slashes', () => {
    const { config } = readConfig({ ...base, CORS_ORIGIN: 'https://app.example.com/, https://admin.example.com' });
    expect(config.corsOrigins).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });
});

describe('tokens', () => {
  it('stores only a deterministic hash of the random token', () => {
    const { token, hash } = createSecureToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toBe(token);
  });

  it('reads bearer tokens strictly', () => {
    expect(getBearerToken('Bearer abc')).toBe('abc');
    expect(getBearerToken('Bearerabc')).toBeNull();
    expect(getBearerToken('Basic abc')).toBeNull();
    expect(getBearerToken(undefined)).toBeNull();
  });
});

describe('auth input validation', () => {
  const run = async (validators: { run: (req: Request) => Promise<unknown> }[], body: unknown) => {
    const req = { body } as Request;
    for (const validator of validators) await validator.run(req);
    return validationResult(req);
  };

  it('rejects NoSQL operator objects on login', async () => {
    const result = await run(validateLogin, { email: { $gt: '' }, password: { $ne: null } });
    expect(result.isEmpty()).toBe(false);
  });

  it('accepts a normal login', async () => {
    const result = await run(validateLogin, { email: 'Demo@TaskMan.test', password: 'demo1234' });
    expect(result.isEmpty()).toBe(true);
  });

  it('requires 8+ character passwords on signup', async () => {
    const result = await run(validateSignup, { name: 'A', email: 'a@b.co', password: 'short1' });
    expect(result.array().map(e => (e as { path?: string }).path)).toContain('password');
  });
});
