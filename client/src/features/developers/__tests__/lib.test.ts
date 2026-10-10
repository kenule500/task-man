import {
  ALL_EVENT_KEYS, DEFAULT_EXPIRY, EXPIRY_OPTIONS, SCOPES, defaultScopes, describeEvents, eventLabel, grantableScopes, groupScopes,
} from '../lib/catalog';
import { curlSnippet, describeExpiry, verifySnippet } from '../lib/snippets';

describe('scopes', () => {
  it('offers only the scopes the person holds', () => {
    const keys = grantableScopes(['tasks:read', 'tasks:write', 'unknown:thing']).map(scope => scope.key);
    expect(keys).toEqual(['tasks:read', 'tasks:write']);
    expect(grantableScopes([])).toEqual([]);
  });

  it('groups scopes in catalog order and preselects the read scopes', () => {
    expect(groupScopes(SCOPES).map(group => group.group)).toEqual(['Projects', 'Tasks', 'Users', 'Reports', 'Settings']);
    expect(defaultScopes(SCOPES)).toEqual(['projects:read', 'tasks:read', 'users:read', 'reports:read']);
    expect(defaultScopes(grantableScopes(['tasks:read', 'tasks:write']))).toEqual(['tasks:read']);
  });

  it('defaults to 90 days and offers a no-expiry option', () => {
    expect(DEFAULT_EXPIRY).toBe('90');
    expect(EXPIRY_OPTIONS.map(option => option.days)).toEqual([30, 90, 365, null]);
  });
});

describe('events', () => {
  it('has unique keys and readable labels', () => {
    expect(new Set(ALL_EVENT_KEYS).size).toBe(ALL_EVENT_KEYS.length);
    expect(eventLabel('task.created')).toBe('Task created');
    expect(eventLabel('ping')).toBe('Test event');
    expect(eventLabel('something.else')).toBe('something.else');
  });

  it('describes a subscription', () => {
    expect(describeEvents(['*'])).toBe('All events');
    expect(describeEvents(['task.created'])).toBe('Task created');
    expect(describeEvents(['task.created', 'task.deleted'])).toBe('2 events');
  });
});

describe('snippets', () => {
  it('builds the curl example from the API URL and the workspace slug', () => {
    expect(curlSnippet('http://localhost:5000/api/', 'acme')).toBe(
      'curl -H "Authorization: Bearer tm_…" http://localhost:5000/api/workspaces/acme/tasks',
    );
  });

  it('shows how to verify the signature with the raw body', () => {
    const code = verifySnippet();
    expect(code).toContain("createHmac('sha256', secret).update(rawBody).digest('hex')");
    expect(code).toContain('timingSafeEqual');
  });

  it('describes token expiry', () => {
    const now = new Date('2030-01-01T00:00:00Z');
    expect(describeExpiry(null, now)).toBe('Never expires');
    expect(describeExpiry('2029-12-31T00:00:00Z', now)).toBe('Expired');
    expect(describeExpiry('2030-01-02T00:00:00Z', now)).toBe('Expires in 1 day');
    expect(describeExpiry('2030-01-31T00:00:00Z', now)).toBe('Expires in 30 days');
  });
});
