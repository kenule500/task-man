import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { makeProject, makeSprint } from '@/features/projects/__tests__/fixtures';
import type { TaskUser } from '@/features/tasks';
import {
  UNASSIGNED_ID, aggregateWorkload, defaultWorkloadProject, defaultWorkloadSprint, describeLoad, tasksInScope,
} from '../lib/workload';

const ana: TaskUser = { _id: 'u-ana', name: 'Ana' };
const ben: TaskUser = { _id: 'u-ben', name: 'Ben' };

describe('tasksInScope', () => {
  const inSprint = makeTask({ sprint: 's1', storyPoints: 3, deadline: '2026-01-01' });
  const tasks = [
    inSprint,
    makeTask({ sprint: 's2', deadline: '2026-01-01' }),
    makeTask({ sprint: 's1', parent: inSprint._id, deadline: '2026-01-01' }),
    makeTask({ sprint: 's1', type: 'epic', deadline: '2026-01-01' }),
    makeTask({ project: 'Website', startDate: '2026-10-05', deadline: '2026-10-12' }),
    makeTask({ project: 'Website', deadline: '2026-10-30' }),
    makeTask({ project: 'App', deadline: '2026-10-09' }),
  ];

  it('keeps top-level work items of the sprint only', () => {
    expect(tasksInScope(tasks, { kind: 'sprint', sprintId: 's1' })).toEqual([inSprint]);
  });

  it('keeps tasks whose dates overlap the range, for one project or all', () => {
    const range = { kind: 'range' as const, from: '2026-10-08', to: '2026-10-14' };
    expect(tasksInScope(tasks, range).map(task => task.project)).toEqual(['Website', 'App']);
    expect(tasksInScope(tasks, { ...range, projectName: ' website ' })).toHaveLength(1);
  });

  it('treats a task without a start date as a single day', () => {
    const range = { kind: 'range' as const, from: '2026-10-30', to: '2026-10-30' };
    expect(tasksInScope(tasks, range)).toHaveLength(1);
  });
});

describe('aggregateWorkload', () => {
  const scoped = [
    makeTask({ title: 'A', assignees: [ana], storyPoints: 5, status: 'completed', deadline: '2026-10-12' }),
    makeTask({ title: 'B', assignees: [ana], storyPoints: 8, status: 'in-progress', deadline: '2026-10-11' }),
    makeTask({ title: 'C', assignees: [ana, ben], storyPoints: 2, deadline: '2026-10-13' }),
    makeTask({ title: 'D', assignees: [ben], storyPoints: null }),
    makeTask({ title: 'E', assignees: [], storyPoints: 3 }),
  ];

  it('sums points and items by status per person, busiest first', () => {
    const { people } = aggregateWorkload(scoped, 10);
    expect(people.map(row => row.name)).toEqual(['Ana', 'Ben']);
    expect(people[0].points).toEqual({ pending: 2, 'in-progress': 8, completed: 5, total: 15 });
    expect(people[0].items).toEqual({ pending: 1, 'in-progress': 1, completed: 1, total: 3 });
    expect(people[1].points.total).toBe(2);
    expect(people[1].unestimated).toBe(1);
  });

  it('flags only people above capacity and reports the overshoot', () => {
    const { people } = aggregateWorkload(scoped, 10);
    expect(people[0]).toMatchObject({ over: true, overBy: 5, usage: 150 });
    expect(people[1]).toMatchObject({ over: false, overBy: 0, usage: 20 });
    expect(aggregateWorkload(scoped, 15).people[0].over).toBe(false);
  });

  it('puts tasks without assignees in the unassigned row and counts each task once in the totals', () => {
    const workload = aggregateWorkload(scoped, 10);
    expect(workload.unassigned).toMatchObject({ id: UNASSIGNED_ID, name: 'Unassigned' });
    expect(workload.unassigned.tasks.map(task => task.title)).toEqual(['E']);
    expect(workload.itemCount).toBe(5);
    expect(workload.pointCount).toBe(18);
  });

  it('lists a persons tasks by deadline', () => {
    expect(aggregateWorkload(scoped, 10).people[0].tasks.map(task => task.title)).toEqual(['B', 'A', 'C']);
  });

  it('handles an empty scope', () => {
    const workload = aggregateWorkload([], 10);
    expect(workload.people).toEqual([]);
    expect(workload.unassigned.items.total).toBe(0);
  });

  it('describes a row for assistive technology', () => {
    const { people } = aggregateWorkload(scoped, 10);
    expect(describeLoad(people[0], 10)).toBe('15 of 10 points, 3 items, over capacity by 5');
    expect(describeLoad(people[1], 10)).toBe('2 of 10 points, 2 items');
  });
});

describe('defaults', () => {
  it('prefers the project with an active sprint, then the first open project', () => {
    const quiet = makeProject({ name: 'Quiet' });
    const busy = makeProject({ name: 'Busy', sprints: [makeSprint({ status: 'active' })] });
    const archived = makeProject({ name: 'Old', archived: true, sprints: [makeSprint({ status: 'active' })] });
    expect(defaultWorkloadProject([quiet, busy])).toBe(busy);
    expect(defaultWorkloadProject([archived, quiet])).toBe(quiet);
    expect(defaultWorkloadProject([])).toBeUndefined();
  });

  it('picks the active sprint, else the next planned, else the latest', () => {
    const done = makeSprint({ status: 'completed', startDate: '2026-08-01T00:00:00.000Z' });
    const active = makeSprint({ status: 'active', startDate: '2026-09-01T00:00:00.000Z' });
    const planned = makeSprint({ status: 'planned', startDate: '2026-10-01T00:00:00.000Z' });
    expect(defaultWorkloadSprint(makeProject({ sprints: [planned, active, done] }))).toBe(active);
    expect(defaultWorkloadSprint(makeProject({ sprints: [done, planned] }))).toBe(planned);
    const later = makeSprint({ status: 'completed', startDate: '2026-09-01T00:00:00.000Z' });
    expect(defaultWorkloadSprint(makeProject({ sprints: [later, done] }))).toBe(later);
    expect(defaultWorkloadSprint(undefined)).toBeUndefined();
  });
});
