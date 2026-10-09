import { Types } from 'mongoose';
import { buildTaskFilter, buildTaskSort, normalizeLabels, parseTaskListQuery } from '../utils/taskQuery.js';

describe('parseTaskListQuery', () => {
  it('falls back to safe defaults for missing or unknown values', () => {
    expect(parseTaskListQuery({ status: 'archived', sort: 'random', search: '   ' })).toEqual({
      status: undefined,
      search: undefined,
      project: undefined,
      assignee: undefined,
      label: undefined,
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

  it('trims and caps the project filter', () => {
    expect(parseTaskListQuery({ project: '  Website  ' }).project).toBe('Website');
    expect(parseTaskListQuery({ project: 'p'.repeat(200) }).project).toHaveLength(60);
    expect(parseTaskListQuery({ project: '   ' }).project).toBeUndefined();
    expect(parseTaskListQuery({ project: { $ne: '' } }).project).toBeUndefined();
  });
});

describe('assignee and label query', () => {
  const userId = new Types.ObjectId().toString();

  it('accepts "me" and valid object ids, rejects everything else', () => {
    expect(parseTaskListQuery({ assignee: 'me' }).assignee).toBe('me');
    expect(parseTaskListQuery({ assignee: userId }).assignee).toBe(userId);
    expect(parseTaskListQuery({ assignee: 'someone' }).assignee).toBeUndefined();
    expect(parseTaskListQuery({ assignee: { $ne: null } }).assignee).toBeUndefined();
    expect(parseTaskListQuery({ assignee: [userId] }).assignee).toBeUndefined();
  });

  it('trims and caps the label and ignores non-strings', () => {
    expect(parseTaskListQuery({ label: '  bug ' }).label).toBe('bug');
    expect(parseTaskListQuery({ label: 'x'.repeat(100) }).label).toHaveLength(40);
    expect(parseTaskListQuery({ label: { $ne: '' } }).label).toBeUndefined();
    expect(parseTaskListQuery({ label: '  ' }).label).toBeUndefined();
  });

  it('filters assignees by the current user for "me"', () => {
    const filter = buildTaskFilter('ws1', { sort: 'createdAt', assignee: 'me' }, userId);
    expect(filter.assignees).toBeInstanceOf(Types.ObjectId);
    expect(String(filter.assignees)).toBe(userId);
  });

  it('filters by an explicit user id and by label', () => {
    const filter = buildTaskFilter('ws1', { sort: 'createdAt', assignee: userId, label: 'bug' });
    expect(String(filter.assignees)).toBe(userId);
    expect(filter.labels).toBe('bug');
  });

  it('matches nothing for "me" without a user', () => {
    expect(buildTaskFilter('ws1', { sort: 'createdAt', assignee: 'me' }).assignees).toEqual({ $in: [] });
  });
});

describe('normalizeLabels', () => {
  it('trims, collapses spaces, drops blanks and case-insensitive duplicates', () => {
    expect(normalizeLabels([' Bug ', 'bug', '', '  ', 'Ui   polish', 3, null])).toEqual(['Bug', 'Ui polish']);
  });

  it('returns an empty list for non-arrays', () => {
    expect(normalizeLabels('bug')).toEqual([]);
    expect(normalizeLabels(undefined)).toEqual([]);
  });
});

describe('buildTaskFilter', () => {
  it('always scopes to the workspace', () => {
    expect(buildTaskFilter('ws1', { sort: 'createdAt' })).toEqual({ workspace: 'ws1' });
  });

  it('filters by exact project name', () => {
    expect(buildTaskFilter('ws1', { sort: 'createdAt', project: 'Website' })).toEqual({
      workspace: 'ws1',
      project: 'Website',
    });
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
