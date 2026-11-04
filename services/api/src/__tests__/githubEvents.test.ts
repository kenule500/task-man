import crypto from 'crypto';
import {
  extractTaskKeys, nextStatus, planGithubEvent, safeGithubUrl, signBody, verifySignature,
} from '../utils/githubEvents.js';

describe('verifySignature', () => {
  const secret = 'a'.repeat(64);
  const raw = Buffer.from('{"zen":"Keep it logically awesome."}');

  it('accepts the HMAC SHA-256 of the raw body', () => {
    expect(verifySignature(secret, raw, signBody(secret, raw))).toBe(true);
    expect(verifySignature(secret, raw, signBody(secret, raw).toUpperCase().replace('SHA256', 'sha256'))).toBe(true);
  });

  it('rejects another secret or another body', () => {
    expect(verifySignature(secret, raw, signBody('b'.repeat(64), raw))).toBe(false);
    expect(verifySignature(secret, Buffer.from('{}'), signBody(secret, raw))).toBe(false);
  });

  it('rejects missing, malformed and wrong-length headers without throwing', () => {
    const good = signBody(secret, raw);
    expect(verifySignature(secret, raw, undefined)).toBe(false);
    expect(verifySignature(secret, raw, '')).toBe(false);
    expect(verifySignature(secret, raw, good.replace('sha256=', 'sha1='))).toBe(false);
    expect(verifySignature(secret, raw, good.slice(0, -2))).toBe(false);
    expect(verifySignature(secret, raw, `${good}00`)).toBe(false);
    expect(verifySignature(secret, raw, `sha256=${'z'.repeat(64)}`)).toBe(false);
    expect(verifySignature('', raw, good)).toBe(false);
  });

  it('compares with crypto.timingSafeEqual', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    verifySignature(secret, raw, signBody(secret, raw));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    verifySignature(secret, raw, 'sha256=abcd');
    expect(spy).not.toHaveBeenCalled(); // a wrong length would make timingSafeEqual throw
    spy.mockRestore();
  });
});

describe('extractTaskKeys', () => {
  it('finds upper-case keys once each, in order', () => {
    expect(extractTaskKeys(['Fix WEB-12 and API-3, closes WEB-12', 'also TM-7.'])).toEqual([
      { prefix: 'WEB', number: 12 }, { prefix: 'API', number: 3 }, { prefix: 'TM', number: 7 },
    ]);
  });

  it('ignores lower case and look-alikes unless asked', () => {
    expect(extractTaskKeys(['web-12 fixed', 'XWEB1234-1', 'A-1', 'WEB-0', 'WEB-12x'])).toEqual([]);
    expect(extractTaskKeys(['feature/web-12-login'], { ignoreCase: true })).toEqual([{ prefix: 'WEB', number: 12 }]);
  });

  it('handles empty and non-string input', () => {
    expect(extractTaskKeys([undefined, null, ''])).toEqual([]);
  });

  it('caps the number of keys', () => {
    const text = Array.from({ length: 30 }, (_, index) => `WEB-${index + 1}`).join(' ');
    expect(extractTaskKeys([text])).toHaveLength(10);
  });
});

describe('nextStatus', () => {
  it('starts only pending tasks', () => {
    expect(nextStatus('pending', 'start')).toBe('in-progress');
    expect(nextStatus('in-progress', 'start')).toBeNull();
    expect(nextStatus('completed', 'start')).toBeNull();
  });

  it('completes open tasks but never reopens completed ones', () => {
    expect(nextStatus('pending', 'complete')).toBe('completed');
    expect(nextStatus('in-progress', 'complete')).toBe('completed');
    expect(nextStatus('completed', 'complete')).toBeNull();
    expect(nextStatus('pending', undefined)).toBeNull();
  });
});

describe('safeGithubUrl', () => {
  it('only allows plain https://github.com links', () => {
    expect(safeGithubUrl('https://github.com/acme/app/pull/4')).toBe('https://github.com/acme/app/pull/4');
    expect(safeGithubUrl('http://github.com/acme/app')).toBeUndefined();
    expect(safeGithubUrl('https://github.com.evil.io/x')).toBeUndefined();
    expect(safeGithubUrl('https://user@github.com/x')).toBeUndefined();
    expect(safeGithubUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeGithubUrl(42)).toBeUndefined();
  });
});

describe('planGithubEvent', () => {
  const pr = (action: string, extra: Record<string, unknown> = {}) => ({
    action,
    repository: { full_name: 'acme/app' },
    pull_request: {
      number: 4, title: 'WEB-12: add login', body: 'Closes API-3', html_url: 'https://github.com/acme/app/pull/4',
      state: 'open', merged: false, head: { ref: 'feature/web-13-login', sha: 'abc1234def' }, user: { login: 'ada' }, ...extra,
    },
  });
  const commitUrl = (sha: string) => `https://github.com/acme/app/commit/${sha}`;

  it('ignores event types it does not handle', () => {
    expect(planGithubEvent('issues', {})).toBeNull();
    expect(planGithubEvent('ping', {})).toBeNull();
  });

  it('plans a pull request with keys from title, body and branch, and starts the task when opened', () => {
    const [item] = planGithubEvent('pull_request', pr('opened'))!;
    expect(item.keys.map(key => `${key.prefix}-${key.number}`)).toEqual(['WEB-12', 'API-3', 'WEB-13']);
    expect(item.link).toMatchObject({ kind: 'pull_request', state: 'open', number: 4, repo: 'acme/app', sha: 'abc1234def', author: 'ada' });
    expect(item.transition).toBe('start');
  });

  it('completes on merge, a plain close just records the state, edits do not transition', () => {
    const merged = planGithubEvent('pull_request', pr('closed', { state: 'closed', merged: true }))![0];
    expect(merged.link.state).toBe('merged');
    expect(merged.transition).toBe('complete');
    const closed = planGithubEvent('pull_request', pr('closed', { state: 'closed' }))![0];
    expect(closed.link.state).toBe('closed');
    expect(closed.transition).toBeUndefined();
    expect(planGithubEvent('pull_request', pr('edited'))![0].transition).toBeUndefined();
    expect(planGithubEvent('pull_request', pr('synchronize'))![0].transition).toBeUndefined();
  });

  it('does not start tasks for draft pull requests until they are ready', () => {
    expect(planGithubEvent('pull_request', pr('opened', { draft: true }))![0].transition).toBeUndefined();
    expect(planGithubEvent('pull_request', pr('ready_for_review'))![0].transition).toBe('start');
  });

  it('skips pull requests without keys, with foreign urls or unknown actions', () => {
    expect(planGithubEvent('pull_request', pr('opened', { title: 'nothing', body: '', head: { ref: 'main' } }))).toEqual([]);
    expect(planGithubEvent('pull_request', pr('opened', { html_url: 'https://evil.example/x' }))).toEqual([]);
    expect(planGithubEvent('pull_request', pr('labeled'))).toEqual([]);
    expect(planGithubEvent('pull_request', { ...pr('opened'), repository: { full_name: '../etc' } })).toEqual([]);
  });

  it('plans the branch and one commit link per commit that mentions a key', () => {
    const items = planGithubEvent('push', {
      ref: 'refs/heads/feature/WEB-12-login',
      repository: { full_name: 'acme/app' },
      pusher: { name: 'ada' },
      commits: [
        { id: 'a'.repeat(40), message: 'WEB-12 add form\n\nlong body', url: commitUrl('a'.repeat(40)), author: { username: 'ada' } },
        { id: 'b'.repeat(40), message: 'unrelated', url: commitUrl('b'.repeat(40)) },
      ],
    })!;
    expect(items.map(item => item.link.kind)).toEqual(['branch', 'commit']);
    expect(items[0].link.url).toBe('https://github.com/acme/app/tree/feature/WEB-12-login');
    expect(items[1].link).toMatchObject({ title: 'WEB-12 add form', sha: 'a'.repeat(40), author: 'ada' });
  });

  it('ignores branch deletions and plans created branches', () => {
    expect(planGithubEvent('push', { deleted: true, ref: 'refs/heads/web-1', repository: { full_name: 'acme/app' } })).toEqual([]);
    const [branch] = planGithubEvent('create', { ref_type: 'branch', ref: 'web-5-fix', repository: { full_name: 'acme/app' }, sender: { login: 'ada' } })!;
    expect(branch.link).toMatchObject({ kind: 'branch', title: 'web-5-fix', author: 'ada' });
    expect(planGithubEvent('create', { ref_type: 'tag', ref: 'web-5', repository: { full_name: 'acme/app' } })).toEqual([]);
  });
});
