import {
  applyFilters, getDropPosition, getTaskStats, groupByStatus, matchesFilters, positionBetween, sortTasks,
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
