import { branchName, branchPrefix, commitMessage, kebabCase, markdownLink, MAX_BRANCH_LENGTH } from '../lib/devNames';

describe('kebabCase', () => {
  it('lowercases, strips diacritics and collapses punctuation', () => {
    expect(kebabCase('  Café Ünïcode: Fix   the  bug!! ')).toBe('cafe-unicode-fix-the-bug');
    expect(kebabCase('Straße Øre Łódź')).toBe('strasse-ore-lodz');
  });

  it('drops non-latin characters and yields an empty string when nothing is left', () => {
    expect(kebabCase('日本語 ✨')).toBe('');
    expect(kebabCase('API v2 / login')).toBe('api-v2-login');
  });
});

describe('branchPrefix', () => {
  it('maps the work item type', () => {
    expect(branchPrefix('bug')).toBe('fix/');
    expect(branchPrefix('spike')).toBe('spike/');
    expect(branchPrefix('story')).toBe('feature/');
    expect(branchPrefix('task')).toBe('feature/');
    expect(branchPrefix(undefined)).toBe('feature/');
  });
});

describe('branchName', () => {
  it('builds feature/KEY-title', () => {
    expect(branchName({ title: 'Add Dark Mode to Settings', type: 'story' }, 'WEB-12')).toBe('feature/WEB-12-add-dark-mode-to-settings');
  });

  it('uses fix/ for bugs and spike/ for spikes', () => {
    expect(branchName({ title: 'Crash on login', type: 'bug' }, 'WEB-3')).toBe('fix/WEB-3-crash-on-login');
    expect(branchName({ title: 'Try Redis', type: 'spike' }, 'WEB-4')).toBe('spike/WEB-4-try-redis');
  });

  it('removes diacritics and keeps the name ASCII', () => {
    expect(branchName({ title: 'Überprüfung der Währung', type: 'task' }, 'TM-9')).toBe('feature/TM-9-uberprufung-der-wahrung');
  });

  it('never exceeds 60 characters, cuts at a word boundary and leaves no trailing dash', () => {
    const name = branchName({ title: 'Implement the very long running background synchronisation of calendars', type: 'task' }, 'WEB-1234');
    expect(name.length).toBeLessThanOrEqual(MAX_BRANCH_LENGTH);
    expect(name).toBe('feature/WEB-1234-implement-the-very-long-running-background');
    expect(name.endsWith('-')).toBe(false);
  });

  it('cuts a single huge word without a boundary', () => {
    const name = branchName({ title: 'x'.repeat(100), type: 'task' }, 'WEB-1');
    expect(name).toHaveLength(MAX_BRANCH_LENGTH);
    expect(name).toMatch(/^feature\/WEB-1-x+$/);
  });

  it('works without a key and falls back to the key alone or "task" for empty titles', () => {
    expect(branchName({ title: 'Plain title', type: 'task' })).toBe('feature/plain-title');
    expect(branchName({ title: '✨✨', type: 'task' }, 'WEB-5')).toBe('feature/WEB-5');
    expect(branchName({ title: '✨✨', type: 'bug' })).toBe('fix/task');
  });
});

describe('commitMessage', () => {
  it('prefixes the key', () => {
    expect(commitMessage({ title: '  Add   login ' }, 'WEB-12')).toBe('WEB-12: Add login');
  });

  it('is just the title without a key', () => {
    expect(commitMessage({ title: 'Add login' })).toBe('Add login');
  });
});

describe('markdownLink', () => {
  const url = 'https://app.example.com/acme/tasks?task=abc';

  it('links key and title', () => {
    expect(markdownLink({ title: 'Add login' }, url, 'WEB-12')).toBe(`[WEB-12 Add login](${url})`);
  });

  it('works without a key', () => {
    expect(markdownLink({ title: 'Add login' }, url)).toBe(`[Add login](${url})`);
  });

  it('escapes brackets in the title and parentheses in the url', () => {
    expect(markdownLink({ title: 'Fix [auth] \\ flow' }, 'https://x.dev/a(b)', 'WEB-1'))
      .toBe('[WEB-1 Fix \\[auth\\] \\\\ flow](https://x.dev/a%28b%29)');
  });
});
