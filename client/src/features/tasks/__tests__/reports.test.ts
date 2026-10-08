import { buildReport, summarizeProjects } from '../lib/reports';
import { makeTask } from './fixtures';

// Wednesday 2026-10-07 (local)
const today = new Date(2026, 9, 7);

describe('summarizeProjects', () => {
  it('groups by project, sorted by name, with tasks without a project under an empty name', () => {
    const tasks = [
      makeTask({ project: 'Website', status: 'completed', deadline: '2026-10-01' }),
      makeTask({ project: 'Website', status: 'in-progress', deadline: '2026-10-20' }),
      makeTask({ project: 'Website', status: 'pending', deadline: '2026-10-03' }),
      makeTask({ project: 'App', status: 'pending', deadline: '2026-10-15' }),
      makeTask({ project: '  ', status: 'pending', deadline: '2026-10-09' }),
      makeTask({ status: 'completed' }),
    ];
    const result = summarizeProjects(tasks, today);

    expect(result.map(p => p.name)).toEqual(['', 'App', 'Website']);
    expect(result[2]).toEqual({
      name: 'Website', total: 3, completed: 1, inProgress: 1, overdue: 1, progress: 33, nextDeadline: '2026-10-03',
    });
    expect(result[1]).toMatchObject({ total: 1, progress: 0, overdue: 0, nextDeadline: '2026-10-15' });
    expect(result[0]).toMatchObject({ total: 2, completed: 1, progress: 50, nextDeadline: '2026-10-09' });
  });

  it('has no next deadline when everything is completed, and 100% progress', () => {
    const [project] = summarizeProjects([makeTask({ project: 'Done', status: 'completed' })], today);
    expect(project.nextDeadline).toBeUndefined();
    expect(project.progress).toBe(100);
  });

  it('returns an empty list for no tasks', () => {
    expect(summarizeProjects([], today)).toEqual([]);
  });
});

describe('buildReport', () => {
  it('returns zeroes for no tasks', () => {
    const report = buildReport([], today);
    expect(report.total).toBe(0);
    expect(report.completionRate).toBe(0);
    expect(report.byStatus).toEqual({ pending: 0, 'in-progress': 0, completed: 0 });
    expect(report.completedPerWeek).toHaveLength(6);
    expect(report.completedPerWeek.every(week => week.count === 0)).toBe(true);
  });

  it('counts by status and priority and computes the completion rate', () => {
    const report = buildReport([
      makeTask({ status: 'completed', priority: 'high' }),
      makeTask({ status: 'pending', priority: 'high' }),
      makeTask({ status: 'in-progress', priority: 'low' }),
      makeTask({ status: 'pending', priority: 'medium' }),
    ], today);

    expect(report.total).toBe(4);
    expect(report.completionRate).toBe(25);
    expect(report.byStatus).toEqual({ pending: 2, 'in-progress': 1, completed: 1 });
    expect(report.byPriority).toEqual({ high: 2, medium: 1, low: 1 });
  });

  it('lists overdue tasks and tasks due in the next 7 days, sorted by deadline, ignoring completed', () => {
    const late = makeTask({ deadline: '2026-10-05T00:00:00.000Z' });
    const later = makeTask({ deadline: '2026-10-06T00:00:00.000Z' });
    const todayTask = makeTask({ deadline: '2026-10-07T00:00:00.000Z' });
    const edge = makeTask({ deadline: '2026-10-14T00:00:00.000Z' });
    const beyond = makeTask({ deadline: '2026-10-15T00:00:00.000Z' });
    const doneLate = makeTask({ deadline: '2026-10-01T00:00:00.000Z', status: 'completed' });
    const doneSoon = makeTask({ deadline: '2026-10-08T00:00:00.000Z', status: 'completed' });

    const report = buildReport([later, edge, beyond, todayTask, doneLate, late, doneSoon], today);

    expect(report.overdue.map(t => t._id)).toEqual([late._id, later._id]);
    expect(report.dueThisWeek.map(t => t._id)).toEqual([todayTask._id, edge._id]);
  });

  it('buckets completions into the last 6 Monday-start weeks, oldest first', () => {
    const done = (completedAt: string) => makeTask({ status: 'completed', completedAt });
    const report = buildReport([
      done('2026-10-07T12:00:00'), // current week (Mon Oct 5)
      done('2026-10-05T12:00:00'), // current week
      done('2026-10-04T12:00:00'), // previous week (Mon Sep 28), Sunday
      done('2026-08-31T12:00:00'), // first week (Mon Aug 31)
      done('2026-08-30T12:00:00'), // before the window
      makeTask({ status: 'completed' }), // no completedAt
    ], today);

    expect(report.completedPerWeek.map(w => w.label)).toEqual(['Aug 31', 'Sep 7', 'Sep 14', 'Sep 21', 'Sep 28', 'Oct 5']);
    expect(report.completedPerWeek.map(w => w.count)).toEqual([1, 0, 0, 0, 1, 2]);
  });
});
