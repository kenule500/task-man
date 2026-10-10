import {
  API_TOKEN_PREFIX, expiryFromDays, generateApiToken, hashApiToken, isApiTokenFormat, isTokenUsable, scopesWithinPermissions,
} from '../utils/apiTokens.js';

describe('generateApiToken', () => {
  it('returns tm_ plus 40 base62 characters and a matching display prefix and hash', () => {
    const { token, prefix, hash } = generateApiToken();
    expect(token).toMatch(/^tm_[0-9A-Za-z]{40}$/);
    expect(token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(prefix).toBe(token.slice(3, 11));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashApiToken(token));
    expect(hash).not.toContain(token);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateApiToken().token));
    expect(tokens.size).toBe(200);
  });

  it('recognises only well-formed tokens', () => {
    expect(isApiTokenFormat(generateApiToken().token)).toBe(true);
    expect(isApiTokenFormat('tm_short')).toBe(false);
    expect(isApiTokenFormat(`tm_${'a'.repeat(41)}`)).toBe(false);
    expect(isApiTokenFormat(`xx_${'a'.repeat(40)}`)).toBe(false);
    expect(isApiTokenFormat(`tm_${'-'.repeat(40)}`)).toBe(false);
  });
});

describe('scopesWithinPermissions', () => {
  const own = ['tasks:read', 'tasks:write', 'projects:read'];
  it('accepts a subset', () => {
    expect(scopesWithinPermissions(['tasks:read'], own)).toBe(true);
    expect(scopesWithinPermissions(own, own)).toBe(true);
  });
  it('rejects scopes the caller lacks or that do not exist', () => {
    expect(scopesWithinPermissions(['settings:manage'], own)).toBe(false);
    expect(scopesWithinPermissions(['tasks:read', 'tasks:delete'], own)).toBe(false);
    expect(scopesWithinPermissions(['nope:nope'], ['nope:nope'])).toBe(false);
    expect(scopesWithinPermissions(['__proto__'], ['__proto__'])).toBe(false);
  });
});

describe('expiry', () => {
  const now = new Date('2030-01-01T00:00:00Z');
  it('converts days to a date and null to never', () => {
    expect(expiryFromDays(30, now)?.toISOString()).toBe('2030-01-31T00:00:00.000Z');
    expect(expiryFromDays(null, now)).toBeNull();
  });
  it('treats revoked and past-expiry tokens as unusable', () => {
    expect(isTokenUsable({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isTokenUsable({ revokedAt: now, expiresAt: null }, now)).toBe(false);
    expect(isTokenUsable({ expiresAt: new Date('2029-12-31T00:00:00Z') }, now)).toBe(false);
    expect(isTokenUsable({ expiresAt: new Date('2030-01-02T00:00:00Z') }, now)).toBe(true);
  });
});
