import { buildBurndown } from '@/features/projects';
import { deliveredPercent, pointsLabel, scopeTasksOf } from '../lib/sprintReport';
import { item, makeReport, total } from './fixtures';

describe('scopeTasksOf', () => {
  it('turns completed and not completed items into tasks of the sprint for the burndown', () => {
    const report = makeReport({
      completed: [item({ _id: 'a', status: 'completed', storyPoints: 5, completedAt: '2026-10-03T10:00:00.000Z' })],
      notCompleted: [item({ _id: 'b', storyPoints: 3 })],
    });
    const tasks = scopeTasksOf(report);
    expect(tasks.map(task => [task._id, task.sprint, task.status])).toEqual([['a', 's1', 'completed'], ['b', 's1', 'pending']]);

    const burndown = buildBurndown(report.sprint, tasks, new Date(2026, 9, 5));
    expect(burndown).toMatchObject({ unit: 'points', total: 8 });
    expect(burndown.points[2].remaining).toBe(3);
  });
});

describe('deliveredPercent', () => {
  it('uses points when any work is estimated', () => {
    expect(deliveredPercent(makeReport().summary)).toBe(63);
  });

  it('falls back to item counts without estimates', () => {
    const summary = makeReport().summary;
    expect(deliveredPercent({ ...summary, completed: total(1, 0), notCompleted: total(3, 0) })).toBe(25);
  });

  it('is zero for an empty sprint', () => {
    const summary = makeReport().summary;
    expect(deliveredPercent({ ...summary, completed: total(0, 0), notCompleted: total(0, 0) })).toBe(0);
  });
});

describe('pointsLabel', () => {
  it('pluralises', () => {
    expect([pointsLabel(0), pointsLabel(1), pointsLabel(8)]).toEqual(['0 pts', '1 pt', '8 pts']);
  });
});
