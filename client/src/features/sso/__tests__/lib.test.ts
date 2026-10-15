import {
  consumeSsoPending, markSsoPending, parseSsoFragment, safeAppPath, ssoErrorMessage, storedUserFromProfile,
} from '../lib';

describe('ssoErrorMessage', () => {
  it('explains every code the server sends in plain language', () => {
    for (const code of ['access_denied', 'invalid_state', 'provider_error', 'invalid_token', 'email_missing', 'email_unverified', 'tenant_not_allowed', 'account_conflict', 'server_error']) {
      const message = ssoErrorMessage(code);
      expect(message).toBeTruthy();
      expect(message).not.toContain(code);
    }
  });

  it('returns nothing without a code and never echoes an unknown one', () => {
    expect(ssoErrorMessage(null)).toBeNull();
    expect(ssoErrorMessage('')).toBeNull();
    const unknown = ssoErrorMessage('<script>alert(1)</script>');
    expect(unknown).toMatch(/did not work/);
    expect(unknown).not.toContain('script');
  });
});

describe('safeAppPath', () => {
  it('accepts relative paths only', () => {
    expect(safeAppPath('/join/ABC')).toBe('/join/ABC');
    for (const value of ['https://evil.example', '//evil.example', '/\\evil', 'evil', '', null, undefined, 12]) {
      expect(safeAppPath(value)).toBeNull();
    }
  });
});

describe('parseSsoFragment', () => {
  it('reads the token and a safe redirect', () => {
    expect(parseSsoFragment('#token=abc.def.ghi&redirect=%2Fjoin%2FXYZ')).toEqual({ token: 'abc.def.ghi', challenge: null, redirect: '/join/XYZ' });
  });

  it('reads a challenge and drops an unsafe redirect', () => {
    expect(parseSsoFragment('#challenge=c.h.a&redirect=https%3A%2F%2Fevil.example')).toEqual({ token: null, challenge: 'c.h.a', redirect: null });
    expect(parseSsoFragment('')).toEqual({ token: null, challenge: null, redirect: null });
  });
});

describe('pending sign-in marker', () => {
  beforeEach(() => sessionStorage.clear());

  it('is accepted once, right after a sign-in was started', () => {
    expect(consumeSsoPending()).toBe(false);
    markSsoPending('google');
    expect(consumeSsoPending()).toBe(true);
    expect(consumeSsoPending()).toBe(false);
  });

  it('expires', () => {
    sessionStorage.setItem('ssoPending', JSON.stringify({ provider: 'google', at: Date.now() - 20 * 60 * 1000 }));
    expect(consumeSsoPending()).toBe(false);
    sessionStorage.setItem('ssoPending', 'not json');
    expect(consumeSsoPending()).toBe(false);
  });
});

describe('storedUserFromProfile', () => {
  it('builds the same shape a password sign-in returns', () => {
    const user = storedUserFromProfile({
      _id: 'u1', name: 'Ada', email: 'ada@example.com', onboarding: { completedAt: '2026-01-01T00:00:00Z' },
      activeWorkspace: 'w2', workspaces: [{ _id: 'w1', slug: 'one' }, { _id: 'w2', slug: 'two' }],
    });
    expect(user).toMatchObject({
      _id: 'u1', name: 'Ada', email: 'ada@example.com', onboardingComplete: true, activeWorkspace: 'w2', activeWorkspaceSlug: 'two', workspaces: ['w1', 'w2'],
    });
  });

  it('handles a brand-new account without onboarding or workspaces', () => {
    expect(storedUserFromProfile({ _id: 'u1', name: 'New', email: 'n@example.com', workspaces: [] }))
      .toMatchObject({ onboardingComplete: false, activeWorkspaceSlug: undefined, workspaces: [] });
  });
});
