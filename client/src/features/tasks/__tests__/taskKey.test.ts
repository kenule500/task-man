import { copyToClipboard, matchesKey, parseTaskKey, resolveTaskKey, taskKey, taskLink } from '../lib/taskKey';
import { makeTask } from './fixtures';

describe('taskKey', () => {
  it('joins the project key and the number, defaulting to TM', () => {
    expect(taskKey({ number: 12 }, 'WEB')).toBe('WEB-12');
    expect(taskKey({ number: 5 })).toBe('TM-5');
    expect(taskKey({ number: 5 }, '  ')).toBe('TM-5');
  });

  it('is empty without a number (zero is a number)', () => {
    expect(taskKey({}, 'WEB')).toBe('');
    expect(taskKey({ number: 0 }, 'WEB')).toBe('WEB-0');
  });

  it('resolves the project key through a lookup', () => {
    const byName = (name: string | undefined | null) => (name === 'Website' ? { key: 'WEB' } : undefined);
    expect(resolveTaskKey({ number: 2, project: 'Website' }, byName)).toBe('WEB-2');
    expect(resolveTaskKey({ number: 2, project: 'Gone' }, byName)).toBe('TM-2');
    expect(resolveTaskKey({ number: 2 }, byName)).toBe('TM-2');
  });
});

describe('parseTaskKey', () => {
  it('reads WEB-12, #12 and 12', () => {
    expect(parseTaskKey('WEB-12')).toBe(12);
    expect(parseTaskKey(' web-12 ')).toBe(12);
    expect(parseTaskKey('#12')).toBe(12);
    expect(parseTaskKey('12')).toBe(12);
  });

  it('rejects anything else', () => {
    for (const text of ['', 'abc', 'WEB-', 'WEB-1a', '12 13', 'W-1', 'TOOLONGKEY-1', '-5']) expect(parseTaskKey(text)).toBeNull();
  });
});

describe('matchesKey', () => {
  const task = makeTask({ number: 12 });

  it('matches by number, "#number" and full key', () => {
    expect(matchesKey(task, '12')).toBe(true);
    expect(matchesKey(task, '#12')).toBe(true);
    expect(matchesKey(task, 'web-12', 'WEB')).toBe(true);
    expect(matchesKey(task, 'WEB-12', 'WEB')).toBe(true);
  });

  it('does not match other numbers, other projects or blank queries', () => {
    expect(matchesKey(task, '1')).toBe(false);
    expect(matchesKey(task, 'api-12', 'WEB')).toBe(false);
    expect(matchesKey(task, '')).toBe(false);
    expect(matchesKey(makeTask(), '12')).toBe(false);
  });

  it('matches the start of a key once a dash is typed', () => {
    expect(matchesKey(task, 'web-1', 'WEB')).toBe(true);
    expect(matchesKey(task, 'web-', 'WEB')).toBe(true);
    expect(matchesKey(task, 'web', 'WEB')).toBe(false);
  });
});

describe('taskLink and copyToClipboard', () => {
  it('builds the deep link handled by the task page', () => {
    expect(taskLink('https://app.test', 'acme', 'abc')).toBe('https://app.test/acme/tasks?task=abc');
  });

  it('copies through the clipboard and reports false when it is missing or blocked', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyToClipboard('WEB-1')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('WEB-1');

    writeText.mockRejectedValueOnce(new Error('denied'));
    await expect(copyToClipboard('WEB-1')).resolves.toBe(false);

    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await expect(copyToClipboard('WEB-1')).resolves.toBe(false);
  });
});
