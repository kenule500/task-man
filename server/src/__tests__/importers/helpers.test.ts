import { resolveLinks } from '../../utils/importers/links.js';
import {
  cleanText, normalizePriority, parseCalendarDate, parseDateTime, parseStoryPoints, splitList, suggestStatus, suggestType,
} from '../../utils/importers/text.js';

describe('parseCalendarDate', () => {
  it.each([
    ['2030-06-15', '2030-06-15'],
    ['2030-06-15T23:59:00.000Z', '2030-06-15'],
    ['2030/6/5', '2030-06-05'],
    ['12/Mar/24 9:30 AM', '2024-03-12'],
    ['5 September 2030', '2030-09-05'],
    ['Sep 5, 2030', '2030-09-05'],
    ['25/12/2030', '2030-12-25'],
    ['12/25/2030', '2030-12-25'],
  ])('reads %s', (raw, expected) => expect(parseCalendarDate(raw)).toBe(expected));

  it.each(['', 'soon', '03/04/2030', '2030-02-30', '2030-13-01', '31/Feb/24'])('rejects %p', raw => {
    expect(parseCalendarDate(raw)).toBeNull();
  });
});

describe('parseDateTime', () => {
  it('reads ISO and Jira date-times', () => {
    expect(parseDateTime('2030-05-20T10:30:00.000Z')).toBe('2030-05-20T10:30:00.000Z');
    expect(parseDateTime('14/Mar/24 2:15 PM')).toBe('2024-03-14T14:15:00.000Z');
    expect(parseDateTime('14/Mar/24 12:05 AM')).toBe('2024-03-14T00:05:00.000Z');
    expect(parseDateTime('2030-01-02')).toBe('2030-01-02T00:00:00.000Z');
    expect(parseDateTime('later')).toBeNull();
  });
});

describe('value helpers', () => {
  it('maps priority words', () => {
    expect(normalizePriority('Highest')).toBe('high');
    expect(normalizePriority('Normal')).toBe('medium');
    expect(normalizePriority('Trivial')).toBe('low');
    expect(normalizePriority('whenever')).toBeNull();
  });

  it('reads story points', () => {
    expect(parseStoryPoints('5')).toBe(5);
    expect(parseStoryPoints('2,5')).toBe(3);
    expect(parseStoryPoints('101')).toBeNull();
    expect(parseStoryPoints('-1')).toBeNull();
    expect(parseStoryPoints('abc')).toBeNull();
  });

  it('cleans text', () => {
    expect(cleanText('  a\u0000b ​c\n d ', 20)).toBe('ab c d');
    expect(cleanText('l1\r\nl2\u0007  \n\nl3', 50, true)).toBe('l1\nl2\n\nl3');
    expect(cleanText('abcdef', 3)).toBe('abc');
    expect(cleanText({ $ne: 1 }, 10)).toBe('');
  });

  it('splits lists without duplicates', () => {
    expect(splitList('a, b;A\nc')).toEqual(['a', 'b', 'c']);
  });

  it('suggests statuses and types', () => {
    expect(suggestStatus('Done')).toBe('completed');
    expect(suggestStatus('In Review')).toBe('in-progress');
    expect(suggestStatus('Backlog')).toBe('pending');
    expect(suggestType('Sub-task')).toBe('task');
    expect(suggestType('Bug')).toBe('bug');
    expect(suggestType('Epic')).toBe('epic');
    expect(suggestType('')).toBe('task');
  });
});

describe('resolveLinks', () => {
  const item = (externalId: string, parentExternalId: string | null = null, epicExternalId: string | null = null) =>
    ({ externalId, parentExternalId, epicExternalId });
  const types: Record<string, string> = { E: 'epic', A: 'story', B: 'task', C: 'task', D: 'task' };
  const run = (items: ReturnType<typeof item>[]) => resolveLinks(items, id => types[id] ?? 'task');

  it('keeps a parent and lets a subtask inherit its parent epic', () => {
    const { links, warnings } = run([item('E'), item('A', null, 'E'), item('B', 'A')]);
    expect(links.get('A')).toEqual({ parent: null, epic: 'E' });
    expect(links.get('B')).toEqual({ parent: 'A', epic: 'E' });
    expect(warnings).toEqual([]);
  });

  it('treats a parent that is an epic as an epic link', () => {
    expect(run([item('E'), item('A', 'E')]).links.get('A')).toEqual({ parent: null, epic: 'E' });
  });

  it('flattens subtasks of subtasks, cycles and self parents', () => {
    const { links, warnings } = run([item('A'), item('B', 'A'), item('C', 'B'), item('D', 'D')]);
    expect(links.get('B')?.parent).toBe('A');
    expect(links.get('C')?.parent).toBeNull();
    expect(links.get('D')?.parent).toBeNull();
    expect(warnings.join(' ')).toMatch(/one level deep/);
    const cycle = run([item('A', 'B'), item('B', 'A')]);
    expect(cycle.links.get('A')?.parent).toBeNull();
    expect(cycle.links.get('B')?.parent).toBeNull();
  });

  it('drops links of epics and links to missing items', () => {
    const { links, warnings } = run([item('E', 'A'), item('A'), item('B', 'ghost', 'ghost')]);
    expect(links.get('E')).toEqual({ parent: null, epic: null });
    expect(links.get('B')).toEqual({ parent: null, epic: null });
    expect(warnings.length).toBe(3);
  });
});
