import { buildTaskFilter, buildTaskSort, parseTaskListQuery } from '../utils/taskQuery.js';

describe('parseTaskListQuery', () => {
  it('falls back to safe defaults for missing or unknown values', () => {
    expect(parseTaskListQuery({ status: 'archived', sort: 'random', search: '   ' })).toEqual({
      status: undefined,
      search: undefined,
      sort: 'createdAt',
      from: undefined,
      to: undefined,
    });
  });

  it('keeps valid status, sort, search and dates', () => {
    const query = parseTaskListQuery({
      status: 'in-progress',
      sort: 'priority',
      search: '  launch ',
      from: '2026-10-01',
      to: 'not-a-date',
    });
    expect(query.status).toBe('in-progress');
    expect(query.sort).toBe('priority');
    expect(query.search).toBe('launch');
    expect(query.from?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(query.to).toBeUndefined();
  });

  it('caps the search length', () => {
    expect(parseTaskListQuery({ search: 'x'.repeat(500) }).search).toHaveLength(100);
  });
});

describe('buildTaskFilter', () => {
  it('always scopes to the workspace', () => {
    expect(buildTaskFilter('ws1', { sort: 'createdAt' })).toEqual({ workspace: 'ws1' });
  });

  it('combines status, escaped search and a deadline range', () => {
    const from = new Date('2026-10-01');
    const filter = buildTaskFilter('ws1', { status: 'completed', search: 'a+b', sort: 'deadline', from });

    expect(filter.status).toBe('completed');
    expect(filter.deadline).toEqual({ $gte: from });
    const [titleClause] = filter.$or as { title: RegExp }[];
    expect(titleClause.title.test('A+B report')).toBe(true);
    expect(titleClause.title.test('aab')).toBe(false);
  });
});

describe('buildTaskSort', () => {
  it.each([
    ['deadline', { deadline: 1, priorityRank: 1 }],
    ['priority', { priorityRank: 1, deadline: 1 }],
    ['position', { position: 1, deadline: 1 }],
    ['createdAt', { createdAt: -1 }],
  ] as const)('sorts by %s', (sort, expected) => {
    expect(buildTaskSort(sort)).toEqual(expected);
  });
});
