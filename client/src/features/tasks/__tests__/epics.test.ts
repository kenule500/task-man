import { DEFAULT_FILTERS, applyFilters, epicsOf, matchesFilters, withoutEpics } from '../lib/filters';
import { describeEpicProgress, epicProgress, itemsOfEpic } from '../lib/epics';
import { groupIntoSwimlanes, laneIdOf, parseSwimlaneGroup, SWIMLANE_GROUPS } from '../lib/swimlanes';
import { epicFitsProject, epicOptionsFor, toFormValues, toTaskInput } from '../lib/taskForm';
import { TASK_TYPE_META, TASK_TYPES } from '../constants';
import { makeTask } from './fixtures';

const epic = makeTask({ _id: 'epic-1', title: 'Checkout revamp', type: 'epic', project: 'Web', deadline: '2026-12-01T00:00:00.000Z' });
const other = makeTask({ _id: 'epic-2', title: 'Accessibility', type: 'epic', project: 'Web' });

describe('epic type', () => {
  it('is a known type with an accessible tone', () => {
    expect(TASK_TYPES).toContain('epic');
    expect(TASK_TYPE_META.epic).toMatchObject({ label: 'Epic', text: 'text-fuchsia-700' });
  });
});

describe('epic progress', () => {
  it('rolls up the top-level items by points, ignoring subtasks and other epics', () => {
    const tasks = [
      epic,
      makeTask({ epic: 'epic-1', status: 'completed', storyPoints: 5 }),
      makeTask({ epic: 'epic-1', status: 'in-progress', storyPoints: 3 }),
      makeTask({ epic: 'epic-1', status: 'pending', storyPoints: 8 }),
      makeTask({ epic: 'epic-1', parent: 'x', status: 'completed', storyPoints: 99 }),
      makeTask({ epic: 'epic-2', status: 'completed', storyPoints: 13 }),
    ];
    const progress = epicProgress(epic, tasks);
    expect(progress).toMatchObject({ items: 3, doneItems: 1, points: 16, donePoints: 5, percent: 31, unit: 'points' });
    expect(describeEpicProgress(progress)).toBe('1 of 3 items done, 5 of 16 points');
  });

  it('falls back to the item count when nothing is estimated', () => {
    const tasks = [epic, makeTask({ epic: 'epic-1', status: 'completed' }), makeTask({ epic: 'epic-1' })];
    const progress = epicProgress(epic, tasks);
    expect(progress).toMatchObject({ items: 2, doneItems: 1, percent: 50, unit: 'items' });
    expect(describeEpicProgress(progress)).toBe('1 of 2 items done');
  });

  it('is 0% for an epic without items, with the epic dates as span', () => {
    const progress = epicProgress(makeTask({ type: 'epic', startDate: '2026-10-05T00:00:00.000Z', deadline: '2026-11-20T00:00:00.000Z' }), []);
    expect(progress).toMatchObject({ items: 0, percent: 0, start: '2026-10-05', end: '2026-11-20' });
    expect(describeEpicProgress(progress)).toBe('0 of 0 items done');
  });

  it('spans from the earliest start to the latest deadline of the epic and its items', () => {
    const tasks = [
      makeTask({ epic: 'epic-1', startDate: '2026-09-01T00:00:00.000Z', deadline: '2026-09-20T00:00:00.000Z' }),
      makeTask({ epic: 'epic-1', deadline: '2027-01-15T00:00:00.000Z' }),
    ];
    expect(epicProgress(epic, tasks)).toMatchObject({ start: '2026-09-01', end: '2027-01-15' });
  });

  it('lists only the top-level items of the epic', () => {
    const a = makeTask({ epic: 'epic-1' });
    const tasks = [epic, a, makeTask({ epic: 'epic-1', parent: a._id }), makeTask({ epic: 'epic-2' })];
    expect(itemsOfEpic(tasks, 'epic-1')).toEqual([a]);
  });
});

describe('epic filters', () => {
  const inEpic = makeTask({ epic: 'epic-1' });
  const loose = makeTask();

  it('filters by an epic id, by "none" and ignores "all"', () => {
    expect(matchesFilters(inEpic, { ...DEFAULT_FILTERS, epic: 'epic-1' })).toBe(true);
    expect(matchesFilters(loose, { ...DEFAULT_FILTERS, epic: 'epic-1' })).toBe(false);
    expect(matchesFilters(inEpic, { ...DEFAULT_FILTERS, epic: 'epic-2' })).toBe(false);
    expect(matchesFilters(inEpic, { ...DEFAULT_FILTERS, epic: 'none' })).toBe(false);
    expect(matchesFilters(loose, { ...DEFAULT_FILTERS, epic: 'none' })).toBe(true);
    expect(matchesFilters(inEpic, { ...DEFAULT_FILTERS, epic: 'all' })).toBe(true);
    expect(matchesFilters(inEpic, { search: '', status: 'all' })).toBe(true);
  });

  it('combines with the other filters', () => {
    const done = makeTask({ epic: 'epic-1', status: 'completed' });
    expect(applyFilters([inEpic, done, loose], { ...DEFAULT_FILTERS, epic: 'epic-1', status: 'completed' })).toEqual([done]);
  });

  it('separates epics from work items', () => {
    expect(withoutEpics([epic, inEpic, other])).toEqual([inEpic]);
    expect(epicsOf([inEpic, other, epic]).map(item => item._id)).toEqual(expect.arrayContaining(['epic-1', 'epic-2']));
    expect(epicsOf([inEpic, other, epic])).toHaveLength(2);
  });
});

describe('swimlanes by epic', () => {
  const a = makeTask({ title: 'A', epic: 'epic-1' });
  const b = makeTask({ title: 'B', epic: 'epic-2' });
  const c = makeTask({ title: 'C' });
  const d = makeTask({ title: 'D', epic: 'epic-1' });

  it('is a known grouping', () => {
    expect(SWIMLANE_GROUPS).toContain('epic');
    expect(parseSwimlaneGroup('epic')).toBe('epic');
  });

  it('names lanes after the epics, sorted by title, "No epic" last', () => {
    const lanes = groupIntoSwimlanes([c, a, b, d], 'epic', [epic, other]);
    expect(lanes.map(lane => lane.label)).toEqual(['Accessibility', 'Checkout revamp', 'No epic']);
    expect(lanes[1].tasks).toEqual([a, d]);
    expect(lanes[2].tasks).toEqual([c]);
    expect(lanes.reduce((sum, lane) => sum + lane.tasks.length, 0)).toBe(4);
  });

  it('keeps a lane for an epic it cannot name', () => {
    expect(groupIntoSwimlanes([a], 'epic', []).map(lane => lane.label)).toEqual(['Unknown epic']);
  });

  it('finds the lane of a task', () => {
    expect(laneIdOf(a, 'epic')).toBe('epic:epic-1');
    expect(laneIdOf(c, 'epic')).toBe('no-epic');
  });
});

describe('epic in the task form', () => {
  it('prefills the epic and sends it, or null', () => {
    expect(toFormValues()).toMatchObject({ epic: '' });
    const task = makeTask({ epic: 'epic-1' });
    expect(toFormValues(task).epic).toBe('epic-1');
    expect(toTaskInput(toFormValues(task), task).epic).toBe('epic-1');
    expect(toTaskInput({ ...toFormValues(), title: 'x' }).epic).toBeNull();
  });

  it('never sends the inherited epic of a subtask', () => {
    const sub = makeTask({ parent: 'p', epic: 'epic-1' });
    expect(toTaskInput(toFormValues(sub), sub)).not.toHaveProperty('epic');
  });

  it('sends no epic and no sprint for an epic', () => {
    const input = toTaskInput({ ...toFormValues(), title: 'x', type: 'epic', epic: 'epic-1', sprint: 's1' });
    expect(input).toMatchObject({ type: 'epic', epic: null, sprint: null });
  });

  it('offers the epics of the same project, plus the current one', () => {
    const mobile = makeTask({ _id: 'epic-3', title: 'Mobile', type: 'epic', project: 'App' });
    expect(epicOptionsFor([epic, other, mobile], 'Web').map(option => option.label)).toEqual(['No epic', 'Checkout revamp', 'Accessibility']);
    expect(epicOptionsFor([epic, other, mobile], '').map(option => option.label)).toEqual(['No epic', 'Checkout revamp', 'Accessibility', 'Mobile']);
    expect(epicOptionsFor([epic, mobile], 'Web', 'epic-3').map(option => option.value)).toEqual(['none', 'epic-1', 'epic-3']);
  });

  it('checks whether an epic fits a project', () => {
    expect(epicFitsProject(epic, 'Web')).toBe(true);
    expect(epicFitsProject(epic, '')).toBe(true);
    expect(epicFitsProject(epic, 'App')).toBe(false);
    expect(epicFitsProject(undefined, 'Web')).toBe(false);
  });
});
