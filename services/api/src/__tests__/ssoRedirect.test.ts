import { safeRedirectPath } from '../utils/safeRedirect.js';

describe('safeRedirectPath', () => {
  it.each(['/accept-invite/abc', '/join/CODE123', '/demo/tasks?view=board', '/a#b', '/%2f%2fevil'])('accepts %s', value => {
    expect(safeRedirectPath(value)).toBe(value);
  });

  it.each([
    'https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil.example', 'evil.example', 'javascript:alert(1)',
    '', '/a\nb', '/a\u0000b', `/${'a'.repeat(400)}`, 42, undefined, null, ['/a'],
  ])('rejects %p', value => {
    expect(safeRedirectPath(value)).toBeNull();
  });
});
