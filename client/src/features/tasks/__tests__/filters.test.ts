import {
  DEFAULT_FILTERS, applyFilters, filtersKey, getDropPosition, getTaskStats, groupByStatus, matchesFilters, parseFilterParams,
  positionBetween, serializeFilters, sortTasks, withFilterParams,
} from '../lib/filters';
import { makeTask } from './fixtures';

describe('type filter', () => {
  const base = { search: '', status: 'all' as const };

  it('matches the type, treating a missing type as task', () => {
    const bug = makeTask({ type: 'bug' });
    const plain = makeTask();
    expect(matchesFilters(bug, { ...base, type: 'bug' })).toBe(true);
    expect(matchesFilters(plain, { ...base, type: 'bug' })).toBe(false);
    expect(matchesFilters(plain, { ...base, type: 'task' })).toBe(true);
    expect(matchesFilters(bug, { ...base, type: 'all' })).toBe(true);
  });
});

describe('matchesFilters', () => {
  const task = makeTask({ title: 'Write release notes', description: 'Changelog for v1', status: 'in-progress' });

  it('matches title or description, case-insensitively', () => {
    expect(matchesFilters(task, { search: 'RELEASE', status: 'all' })).toBe(true);
    expect(matchesFilters(task, { search: 'changelog', status: 'all' })).toBe(true);
    expect(matchesFilters(task, { search: 'budget', status: 'all' })).toBe(false);
  });

  it('filters by priority', () => {
    expect(matchesFilters(task, { search: '', status: 'all', priority: 'medium' })).toBe(true);
    expect(matchesFilters(task, { search: '', status: 'all', priority: 'high' })).toBe(false);
  });

  it('filters by status', () => {
    expect(matchesFilters(task, { search: '', status: 'in-progress' })).toBe(true);
    expect(matchesFilters(task, { search: '', status: 'completed' })).toBe(false);
  });

  describe('assignee and label filters', () => {
    const ada = { _id: 'u1', name: 'Ada' };
    const mine = makeTask({ assignees: [ada], labels: ['Bug', 'design'] });
    const others = makeTask({ assignees: [{ _id: 'u2', name: 'Grace' }], labels: ['ops'] });
    const bare = makeTask();
    const base = { search: '', status: 'all' as const };

    it('keeps only tasks assigned to the current user', () => {
      const filters = { ...base, assignedToMe: true };
      expect(matchesFilters(mine, filters, 'u1')).toBe(true);
      expect(matchesFilters(others, filters, 'u1')).toBe(false);
      expect(matchesFilters(bare, filters, 'u1')).toBe(false);
    });

    it('matches nothing for "assigned to me" without a signed-in user', () => {
      expect(matchesFilters(mine, { ...base, assignedToMe: true })).toBe(false);
      expect(matchesFilters(mine, { ...base, assignedToMe: false })).toBe(true);
    });

    it('filters by label case-insensitively and ignores "all"', () => {
      expect(matchesFilters(mine, { ...base, label: 'bug' })).toBe(true);
      expect(matchesFilters(others, { ...base, label: 'bug' })).toBe(false);
      expect(matchesFilters(bare, { ...base, label: 'bug' })).toBe(false);
      expect(matchesFilters(bare, { ...base, label: 'all' })).toBe(true);
    });

    it('combines with applyFilters', () => {
      const result = applyFilters(
        [mine, others, bare],
        { search: '', status: 'all', priority: 'all', sort: 'createdAt', assignedToMe: true, label: 'design' },
        'u1',
      );
      expect(result).toEqual([mine]);
    });
  });
});

describe('project and sprint filters', () => {
  const base = { search: '', status: 'all' as const };
  const inSprint = makeTask({ project: 'Web', sprint: 's1' });
  const otherSprint = makeTask({ project: 'web ', sprint: 's2' });
  const backlog = makeTask({ project: 'Web' });
  const elsewhere = makeTask({ project: 'Mobile', sprint: 's1' });
  const all = [inSprint, otherSprint, backlog, elsewhere];

  it('matches the project name ignoring case and spaces', () => {
    expect(all.filter(task => matchesFilters(task, { ...base, project: 'WEB' }))).toEqual([inSprint, otherSprint, backlog]);
  });

  it('matches a sprint id, a list of ids and the backlog', () => {
    expect(all.filter(task => matchesFilters(task, { ...base, project: 'Web', sprint: 's1' }))).toEqual([inSprint]);
    expect(all.filter(task => matchesFilters(task, { ...base, sprint: 's1,s2' }))).toEqual([inSprint, otherSprint, elsewhere]);
    expect(all.filter(task => matchesFilters(task, { ...base, project: 'Web', sprint: 'backlog' }))).toEqual([backlog]);
  });

  it('matches nothing for an unresolved "active" sprint', () => {
    expect(matchesFilters(inSprint, { ...base, sprint: 'active' })).toBe(false);
  });

  it('applies to every view through applyFilters', () => {
    expect(applyFilters([inSprint, backlog, elsewhere], { ...DEFAULT_FILTERS, project: 'Web', sprint: 's1' })).toEqual([inSprint]);
  });
});

describe('sortTasks', () => {
  const late = makeTask({ title: 'late', deadline: '2026-12-01', priority: 'high' });
  const early = makeTask({ title: 'early', deadline: '2026-10-01', priority: 'low' });
  const mid = makeTask({ title: 'mid', deadline: '2026-11-01', priority: 'high' });

  it('sorts by deadline', () => {
    expect(sortTasks([late, early, mid], 'deadline').map(t => t.title)).toEqual(['early', 'mid', 'late']);
  });

  it('sorts by priority, then deadline', () => {
    expect(sortTasks([early, late, mid], 'priority').map(t => t.title)).toEqual(['mid', 'late', 'early']);
  });

  it('does not mutate the input', () => {
    const input = [late, early];
    sortTasks(input, 'deadline');
    expect(input[0]).toBe(late);
  });

  it('combines filters and sorting', () => {
    const result = applyFilters([late, early, mid], { search: '', status: 'all', priority: 'all', sort: 'deadline' });
    expect(result.map(t => t.title)).toEqual(['early', 'mid', 'late']);
  });
});

describe('board ordering', () => {
  it('groups tasks by status ordered by position', () => {
    const a = makeTask({ status: 'pending', position: 3 });
    const b = makeTask({ status: 'pending', position: 1 });
    const c = makeTask({ status: 'completed', position: 2 });
    const groups = groupByStatus([a, b, c]);
    expect(groups.pending).toEqual([b, a]);
    expect(groups['in-progress']).toEqual([]);
    expect(groups.completed).toEqual([c]);
  });

  it('computes positions between neighbours', () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
    expect(positionBetween(undefined, 2000)).toBe(976);
    expect(positionBetween(1000)).toBe(2024);
  });

  it('positions a dropped card relative to the other cards', () => {
    const column = [makeTask({ position: 100 }), makeTask({ position: 200 }), makeTask({ position: 300 })];
    // Move the first card to the end
    expect(getDropPosition(column, column[0]._id, 3)).toBe(1324);
    // Move the last card to the top
    expect(getDropPosition(column, column[2]._id, 0)).toBe(100 - 1024);
    // Card from another column inserted in the middle
    expect(getDropPosition(column, 'other', 1)).toBe(150);
  });

  it('returns null when a card is dropped where it already is', () => {
    const column = [makeTask({ position: 100 }), makeTask({ position: 200 })];
    expect(getDropPosition(column, column[0]._id, 0)).toBeNull();
    expect(getDropPosition(column, column[0]._id, 1)).toBeNull();
  });
});

describe('getTaskStats', () => {
  it('counts tasks per status and unfinished overdue tasks', () => {
    const stats = getTaskStats([
      makeTask({ status: 'pending', deadline: '2099-01-01' }),
      makeTask({ status: 'pending', deadline: '2000-01-01' }),
      makeTask({ status: 'completed', deadline: '2000-01-01' }),
    ]);
    expect(stats).toEqual({ total: 3, pending: 2, inProgress: 0, completed: 1, overdue: 1 });
  });
});

describe('search by task key', () => {
  const base = { status: 'all' as const };
  const task = makeTask({ number: 12, title: 'Unrelated title', project: 'Website' });
  const other = makeTask({ number: 7, title: 'Another one' });
  const webKey = () => 'WEB';

  it('finds a task by "12", "#12" and its full key', () => {
    expect(matchesFilters(task, { ...base, search: '12' })).toBe(true);
    expect(matchesFilters(task, { ...base, search: '#12' })).toBe(true);
    expect(matchesFilters(task, { ...base, search: 'web-12' }, undefined, webKey)).toBe(true);
    expect(matchesFilters(other, { ...base, search: '#12' })).toBe(false);
  });

  it('requires the project part to agree and ignores tasks without a number', () => {
    expect(matchesFilters(task, { ...base, search: 'api-12' }, undefined, webKey)).toBe(false);
    expect(matchesFilters(makeTask({ title: 'No number' }), { ...base, search: '12' })).toBe(false);
  });

  it('narrows by key prefix once a dash is typed', () => {
    expect(matchesFilters(task, { ...base, search: 'web-1' }, undefined, webKey)).toBe(true);
    expect(matchesFilters(task, { ...base, search: 'web-2' }, undefined, webKey)).toBe(false);
  });

  it('keeps title search working and applies through applyFilters', () => {
    const filters = { ...base, search: '#7', priority: 'all' as const, sort: 'createdAt' as const };
    expect(applyFilters([task, other], filters).map(item => item._id)).toEqual([other._id]);
    expect(matchesFilters(task, { ...base, search: 'unrelated' })).toBe(true);
  });
});

describe('filters in the URL', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('parses every filter', () => {
    expect(parseFilterParams(params('q=release&status=in-progress&priority=high&type=bug&label=ops&epic=abc123&assignedToMe=1&sort=deadline'))).toEqual({
      search: 'release', status: 'in-progress', priority: 'high', type: 'bug', label: 'ops', epic: 'abc123', project: 'all', sprint: 'all', assignedToMe: true, sort: 'deadline',
    });
  });

  it('parses the project and sprint scope', () => {
    expect(parseFilterParams(params('project=Website%20redesign&sprint=64f0c1'))).toMatchObject({ project: 'Website redesign', sprint: '64f0c1' });
    expect(parseFilterParams(params('sprint=active')).sprint).toBe('active');
    expect(parseFilterParams(params('sprint=backlog')).sprint).toBe('backlog');
  });

  it('ignores a malformed sprint or an oversized project', () => {
    expect(parseFilterParams(params(`sprint=a b&project=${'p'.repeat(81)}`))).toMatchObject({ project: 'all', sprint: 'all' });
    expect(parseFilterParams(params('sprint=../x')).sprint).toBe('all');
  });

  it('writes the scope to the query string and leaves "all" out', () => {
    expect(serializeFilters({ ...DEFAULT_FILTERS, project: 'Web & Mobile', sprint: 'active' }).toString()).toBe('project=Web+%26+Mobile&sprint=active');
    expect(serializeFilters({ ...DEFAULT_FILTERS, project: 'all', sprint: 'all' }).toString()).toBe('');
  });

  it('replaces the scope with the one of the filters and keeps the view', () => {
    const next = withFilterParams(params('view=board&project=Old&sprint=backlog'), { ...DEFAULT_FILTERS, project: 'New' });
    expect(next.get('project')).toBe('New');
    expect(next.has('sprint')).toBe(false);
    expect(next.get('view')).toBe('board');
  });

  it('falls back to the defaults for a missing query', () => {
    expect(parseFilterParams(params(''))).toEqual(DEFAULT_FILTERS);
  });

  it('ignores unknown, oversized and malformed values', () => {
    const parsed = parseFilterParams(params(`status=done&priority=urgent&type=saga&sort=random&assignedToMe=maybe&label=${'x'.repeat(81)}&epic=two words&q=${'y'.repeat(300)}`));
    expect(parsed).toEqual({ ...DEFAULT_FILTERS, search: 'y'.repeat(200) });
  });

  it('accepts the "none" epic and "true" for assignedToMe', () => {
    expect(parseFilterParams(params('epic=none&assignedToMe=true'))).toMatchObject({ epic: 'none', assignedToMe: true });
  });

  it('leaves defaults out of the query string', () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe('');
    expect(serializeFilters({ ...DEFAULT_FILTERS, search: '   ' }).toString()).toBe('');
    expect(serializeFilters({ ...DEFAULT_FILTERS, status: 'pending', assignedToMe: true, sort: 'priority' }).toString())
      .toBe('status=pending&assignedToMe=1&sort=priority');
  });

  it('round-trips through the query string', () => {
    const filters = { ...DEFAULT_FILTERS, search: 'a & b', status: 'completed' as const, label: 'Front end', epic: 'none', type: 'spike' as const };
    expect(parseFilterParams(serializeFilters(filters))).toEqual(filters);
  });

  it('replaces only its own parameters and keeps view, task and board parameters', () => {
    const next = withFilterParams(params('view=board&task=t1&col=completed&qf=mine&group=assignee&status=pending&q=old'), { ...DEFAULT_FILTERS, priority: 'low' });
    expect(next.get('view')).toBe('board');
    expect(next.get('task')).toBe('t1');
    expect(next.get('col')).toBe('completed');
    expect(next.get('qf')).toBe('mine');
    expect(next.get('group')).toBe('assignee');
    expect(next.get('priority')).toBe('low');
    expect(next.has('status')).toBe(false);
    expect(next.has('q')).toBe(false);
  });

  it('compares filters by their query string', () => {
    expect(filtersKey({ ...DEFAULT_FILTERS, search: ' ' })).toBe(filtersKey(DEFAULT_FILTERS));
    expect(filtersKey({ ...DEFAULT_FILTERS, label: 'a' })).not.toBe(filtersKey(DEFAULT_FILTERS));
  });
});
