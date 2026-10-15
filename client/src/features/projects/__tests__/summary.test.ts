import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { averageVelocity, sprintVelocities } from '../lib/velocity';
import {
  PROJECT_SORT_OPTIONS, countByStatus, countByType, filterProjectEntries, sortProjectEntries, summarizeProject, upcomingDeadlines,
  type ProjectEntry,
} from '../lib/summary';
import { makeProject, makeSprint } from './fixtures';

const done = (points: number, completedAt: string) =>
  makeSprint({ status: 'completed', completedPoints: points, completedAt });

describe('velocity', () => {
  const sprints = [
    done(10, '2026-08-01T00:00:00.000Z'),
    done(20, '2026-08-15T00:00:00.000Z'),
    done(30, '2026-09-01T00:00:00.000Z'),
    done(41, '2026-09-15T00:00:00.000Z'),
    makeSprint({ status: 'active' }),
  ];

  it('lists completed sprints oldest first', () => {
    expect(sprintVelocities(sprints).map(item => item.points)).toEqual([10, 20, 30, 41]);
  });

  it('averages the last three completed sprints', () => {
    expect(averageVelocity(sprints)).toBe(30.3);
    expect(averageVelocity(sprints, 2)).toBe(35.5);
  });

  it('has no velocity before a sprint is completed', () => {
    expect(averageVelocity([makeSprint({ status: 'active' })])).toBeNull();
  });
});

describe('summarizeProject', () => {
  const active = makeSprint({ status: 'active' });
  const project = makeProject({ name: 'Web', sprints: [active] });
  const today = new Date(2026, 9, 10);

  it('counts top-level tasks, progress, overdue and the active sprint', () => {
    const tasks = [
      makeTask({ project: 'web', status: 'completed', storyPoints: 2, sprint: active._id }),
      makeTask({ project: 'Web', storyPoints: 6, sprint: active._id, deadline: '2026-10-01T00:00:00.000Z' }),
      makeTask({ project: 'Web', parent: 'x' }),
      makeTask({ project: 'Other' }),
    ];
    const summary = summarizeProject(project, tasks, today);

    expect(summary).toMatchObject({ total: 2, completed: 1, progress: 50, overdue: 1 });
    expect(summary.activeSprint?._id).toBe(active._id);
    expect(summary.activeProgress?.percent).toBe(25);
  });

  it('is empty for a project without tasks', () => {
    expect(summarizeProject(makeProject({ name: 'Empty' }), [], today)).toMatchObject({ total: 0, progress: 0, activeSprint: undefined });
  });
});

describe('project list helpers', () => {
  const entry = (name: string, progress: number, updatedAt: string, key = 'KEY'): ProjectEntry => ({
    project: makeProject({ name, key, updatedAt }),
    summary: { total: 1, completed: 0, progress, overdue: 0 },
  });
  const entries = [entry('Beta', 20, '2026-01-02'), entry('Alpha', 80, '2026-01-01', 'ALP'), entry('Gamma', 50, '2026-01-03')];
  const names = (list: ProjectEntry[]) => list.map(item => item.project.name);

  it('sorts by name, recent activity or progress', () => {
    expect(names(sortProjectEntries(entries, 'name'))).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(names(sortProjectEntries(entries, 'recent'))).toEqual(['Gamma', 'Beta', 'Alpha']);
    expect(names(sortProjectEntries(entries, 'progress'))).toEqual(['Alpha', 'Gamma', 'Beta']);
    expect(PROJECT_SORT_OPTIONS.map(option => option.value)).toEqual(['name', 'recent', 'progress']);
  });

  it('filters by name or key', () => {
    expect(names(filterProjectEntries(entries, 'et'))).toEqual(['Beta']);
    expect(names(filterProjectEntries(entries, ' alp '))).toEqual(['Alpha']);
    expect(filterProjectEntries(entries, '')).toBe(entries);
  });
});

describe('overview helpers', () => {
  it('counts top-level tasks by status and type', () => {
    const tasks = [
      makeTask({ type: 'bug', status: 'completed' }),
      makeTask({ type: 'story', status: 'in-progress' }),
      makeTask({ status: 'pending' }),
      makeTask({ parent: 'p', type: 'bug' }),
    ];
    expect(countByStatus(tasks)).toEqual({ pending: 1, 'in-progress': 1, completed: 1 });
    expect(countByType(tasks)).toEqual({ story: 1, task: 1, bug: 1, spike: 0, epic: 0 });
  });

  it('lists open tasks by earliest deadline', () => {
    const late = makeTask({ deadline: '2026-12-01T00:00:00.000Z' });
    const soon = makeTask({ deadline: '2026-10-01T00:00:00.000Z' });
    const finished = makeTask({ deadline: '2026-09-01T00:00:00.000Z', status: 'completed' });
    expect(upcomingDeadlines([late, finished, soon], 5)).toEqual([soon, late]);
    expect(upcomingDeadlines([late, soon], 1)).toEqual([soon]);
  });
});
