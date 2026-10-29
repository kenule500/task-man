import { isAllowedOrigin, isLoopbackOrigin } from '../utils/corsOrigins.js';

const ALLOWED = ['http://localhost:5173', 'https://taskman.example.app'];

describe('CORS origin policy', () => {
  it('AC-008: allows a configured origin exactly', () => {
    expect(isAllowedOrigin('http://localhost:5173', ALLOWED)).toBe(true);
    expect(isAllowedOrigin('https://taskman.example.app', ALLOWED)).toBe(true);
  });

  it('AC-008: allows any loopback port in development, which is the port Vite picked', () => {
    for (const origin of [
      'http://localhost:5174',
      'http://localhost:3000',
      'http://127.0.0.1:5174',
      'http://[::1]:5174',
      'https://localhost:5174',
    ]) {
      expect(isAllowedOrigin(origin, ALLOWED, { allowLoopback: true })).toBe(true);
    }
  });

  it('AC-008: keeps the exact list in production', () => {
    expect(isAllowedOrigin('http://localhost:5174', ALLOWED, { allowLoopback: false })).toBe(false);
    expect(isAllowedOrigin('http://localhost:5173', ALLOWED, { allowLoopback: false })).toBe(true);
  });

  it('AC-008: refuses a remote origin and a hostname that only looks like loopback', () => {
    for (const origin of [
      'https://evil.example',
      'http://localhost.evil.example',
      'http://127.0.0.1.evil.example',
      'http://localhost.evil.example:5174',
      'file://',
      'null',
    ]) {
      expect(isAllowedOrigin(origin, ALLOWED, { allowLoopback: true })).toBe(false);
    }
  });

  it('AC-008: leaves a request without an Origin header alone', () => {
    // Same-origin navigation and server-to-server calls carry no Origin; CORS has nothing to decide
    expect(isAllowedOrigin(undefined, ALLOWED, { allowLoopback: false })).toBe(true);
    expect(isAllowedOrigin('', ALLOWED, { allowLoopback: false })).toBe(true);
  });

  it('AC-008: only http(s) on a loopback host counts as local', () => {
    expect(isLoopbackOrigin('ftp://localhost:5174')).toBe(false);
    expect(isLoopbackOrigin('not a url')).toBe(false);
    expect(isLoopbackOrigin('http://LOCALHOST:5174')).toBe(true);
  });
});