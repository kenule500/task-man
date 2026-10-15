import {
  applyQuickFilters, isBlocked, isDueThisWeek, parseQuickFilters, serializeQuickFilters, toggleQuickFilter,
} from '../lib/boardQuickFilters';
import { makeTask } from './fixtures';

const ada = { _id: 'u1', name: 'Ada' };
const grace = { _id: 'u2', name: 'Grace' };
// Wednesday; its week runs Sun 2026-10-11 .. Sat 2026-10-17
const today = new Date(2026, 9, 14);

describe('quick filter URL state', () => {
  it('parses known keys in canonical order and drops unknown ones and duplicates', () => {
    expect(parseQuickFilters('bugs,nope,mine,bugs')).toEqual(['mine', 'bugs']);
    expect(parseQuickFilters('')).toEqual([]);
    expect(parseQuickFilters(null)).toEqual([]);
  });

  it('serializes to a comma list, empty when nothing is active', () => {
    expect(serializeQuickFilters(['blocked', 'mine'])).toBe('mine,blocked');
    expect(serializeQuickFilters([])).toBe('');
  });

  it('toggles a key on and off', () => {
    expect(toggleQuickFilter([], 'bugs')).toEqual(['bugs']);
    expect(toggleQuickFilter(['bugs'], 'mine')).toEqual(['mine', 'bugs']);
    expect(toggleQuickFilter(['mine', 'bugs'], 'bugs')).toEqual(['mine']);
  });
});

describe('applyQuickFilters', () => {
  it('returns the same array without active filters', () => {
    const tasks = [makeTask()];
    expect(applyQuickFilters(tasks, [])).toBe(tasks);
  });

  it('"mine" needs the current user and an assignment', () => {
    const mine = makeTask({ assignees: [grace, ada] });
    const theirs = makeTask({ assignees: [grace] });
    expect(applyQuickFilters([mine, theirs], ['mine'], { currentUserId: 'u1' })).toEqual([mine]);
    expect(applyQuickFilters([mine, theirs], ['mine'])).toEqual([]);
  });

  it('"bugs" matches the bug type only (no type = task)', () => {
    const bug = makeTask({ type: 'bug' });
    expect(applyQuickFilters([bug, makeTask({ type: 'story' }), makeTask()], ['bugs'])).toEqual([bug]);
  });

  it('"unassigned" matches tasks without assignees', () => {
    const free = makeTask({ assignees: [] });
    const unset = makeTask();
    expect(applyQuickFilters([free, unset, makeTask({ assignees: [ada] })], ['unassigned'])).toEqual([free, unset]);
  });

  it('"due-week" covers Sunday to Saturday of the current week', () => {
    const inWeek = [makeTask({ deadline: '2026-10-11' }), makeTask({ deadline: '2026-10-17T00:00:00.000Z' })];
    const outside = [makeTask({ deadline: '2026-10-10' }), makeTask({ deadline: '2026-10-18' })];
    expect(applyQuickFilters([...inWeek, ...outside], ['due-week'], { today })).toEqual(inWeek);
    expect(isDueThisWeek(inWeek[0], today)).toBe(true);
  });

  it('"blocked" needs an unfinished prerequisite, even one hidden by other filters', () => {
    const open = makeTask({ _id: 'open', status: 'in-progress' });
    const done = makeTask({ _id: 'done', status: 'completed' });
    const waiting = makeTask({ _id: 'waiting', dependencies: ['open'] });
    const ready = makeTask({ _id: 'ready', dependencies: ['done'] });
    const finished = makeTask({ _id: 'finished', status: 'completed', dependencies: ['open'] });
    const orphan = makeTask({ _id: 'orphan', dependencies: ['gone'] });
    const all = [open, done, waiting, ready, finished, orphan];

    expect(applyQuickFilters([waiting, ready, finished, orphan], ['blocked'], { allTasks: all })).toEqual([waiting]);
    // Without the full list the prerequisite is unknown, so nothing is blocked
    expect(applyQuickFilters([waiting], ['blocked'])).toEqual([]);
    expect(isBlocked(waiting, new Map(all.map(task => [task._id, task])))).toBe(true);
  });

  it('combines filters with AND', () => {
    const both = makeTask({ type: 'bug', assignees: [ada] });
    const onlyBug = makeTask({ type: 'bug', assignees: [grace] });
    const onlyMine = makeTask({ assignees: [ada] });
    expect(applyQuickFilters([both, onlyBug, onlyMine], ['mine', 'bugs'], { currentUserId: 'u1' })).toEqual([both]);
  });
});
