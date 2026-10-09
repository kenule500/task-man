import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { buildBurndown, describeBurndown } from '../lib/burndown';
import { makeSprint } from './fixtures';

// Five-day sprint, looked at on day 3
const sprint = makeSprint({ status: 'active', startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-05T00:00:00.000Z' });
const today = new Date(2026, 9, 3);

const tasks = [
  makeTask({ sprint: sprint._id, storyPoints: 5, status: 'completed', completedAt: '2026-10-02T12:00:00.000Z' }),
  makeTask({ sprint: sprint._id, storyPoints: 3 }),
  makeTask({ sprint: sprint._id, storyPoints: 2, status: 'completed', completedAt: '2026-10-03T12:00:00.000Z' }),
];

describe('buildBurndown', () => {
  it('draws the ideal line and the remaining points per day', () => {
    const burndown = buildBurndown(sprint, tasks, today);

    expect(burndown.unit).toBe('points');
    expect(burndown.total).toBe(10);
    expect(burndown.points.map(point => point.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    expect(burndown.points.map(point => point.ideal)).toEqual([10, 7.5, 5, 2.5, 0]);
    expect(burndown.points.map(point => point.remaining)).toEqual([10, 5, 3, null, null]);
  });

  it('counts tasks when none is estimated', () => {
    const plain = [
      makeTask({ sprint: sprint._id, status: 'completed', completedAt: '2026-10-01T12:00:00.000Z' }),
      makeTask({ sprint: sprint._id }),
    ];
    const burndown = buildBurndown(sprint, plain, today);
    expect(burndown.unit).toBe('tasks');
    expect(burndown.total).toBe(2);
    expect(burndown.points[0].remaining).toBe(1);
  });

  it('ignores subtasks and tasks of other sprints', () => {
    const parent = makeTask({ sprint: sprint._id, storyPoints: 4 });
    const extra = [
      parent,
      makeTask({ sprint: sprint._id, parent: parent._id, storyPoints: 9 }),
      makeTask({ sprint: 'other', storyPoints: 9 }),
    ];
    expect(buildBurndown(sprint, extra, today).total).toBe(4);
  });

  it('counts work finished before the sprint started from day one', () => {
    const early = [
      makeTask({ sprint: sprint._id, storyPoints: 4, status: 'completed', completedAt: '2026-09-20T12:00:00.000Z' }),
      makeTask({ sprint: sprint._id, storyPoints: 4 }),
    ];
    expect(buildBurndown(sprint, early, today).points[0].remaining).toBe(4);
  });

  it('shows no actuals before the sprint begins and every day after it ended', () => {
    expect(buildBurndown(sprint, tasks, new Date(2026, 8, 20)).points.every(point => point.remaining === null)).toBe(true);
    expect(buildBurndown(sprint, tasks, new Date(2026, 9, 20)).points.every(point => point.remaining !== null)).toBe(true);
  });

  it('handles an empty sprint and a one-day sprint', () => {
    expect(buildBurndown(sprint, [], today).total).toBe(0);
    const oneDay = makeSprint({ startDate: '2026-10-03T00:00:00.000Z', endDate: '2026-10-03T00:00:00.000Z' });
    expect(buildBurndown(oneDay, [], today).points).toHaveLength(1);
  });
});

describe('describeBurndown', () => {
  it('summarizes the latest day against the ideal line', () => {
    const text = describeBurndown(buildBurndown(sprint, tasks, today), today);
    expect(text).toBe('Burndown chart: 3 of 10 points remaining. Day 3 of 5, 2 points ahead of the ideal line.');
  });

  it('says when the sprint has not started', () => {
    const early = new Date(2026, 8, 20);
    expect(describeBurndown(buildBurndown(sprint, tasks, early), early)).toMatch(/has not started/);
  });
});
