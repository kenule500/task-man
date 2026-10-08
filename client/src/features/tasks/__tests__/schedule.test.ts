import { parseDateKey, toDateKey } from '../lib/date';
import {
  buildMonthGrid, buildTimeline, getLinkPath, getStartKey, groupByDeadline, groupDaysByMonth,
  rescheduleToDeadline, resizeTask, shiftTask,
} from '../lib/schedule';
import { makeTask } from './fixtures';

describe('rescheduling', () => {
  const task = makeTask({ startDate: '2026-10-01T00:00:00.000Z', deadline: '2026-10-05T00:00:00.000Z' });

  it('uses the deadline as start for one-day tasks', () => {
    expect(getStartKey(makeTask({ deadline: '2026-10-09' }))).toBe('2026-10-09');
    expect(getStartKey(task)).toBe('2026-10-01');
  });

  it('shifts start and deadline together', () => {
    expect(shiftTask(task, 3)).toEqual({ startDate: '2026-10-04', deadline: '2026-10-08' });
    expect(shiftTask(makeTask({ deadline: '2026-10-05' }), -1)).toEqual({ deadline: '2026-10-04' });
  });

  it('moves a task to a new due day keeping its duration', () => {
    expect(rescheduleToDeadline(task, '2026-10-12')).toEqual({ startDate: '2026-10-08', deadline: '2026-10-12' });
  });

  it('resizes the deadline but never before the start', () => {
    expect(resizeTask(task, 2)).toEqual({ startDate: '2026-10-01', deadline: '2026-10-07' });
    expect(resizeTask(task, -10)).toEqual({ startDate: '2026-10-01', deadline: '2026-10-01' });
  });
});

describe('buildMonthGrid', () => {
  const grid = buildMonthGrid(new Date(2026, 9, 15), new Date(2026, 9, 2));

  it('always returns six full weeks starting on Sunday', () => {
    expect(grid).toHaveLength(42);
    expect(grid[0].date.getDay()).toBe(0);
    expect(grid[0].key).toBe('2026-09-27');
  });

  it('marks days outside the month and today', () => {
    expect(grid[0].inMonth).toBe(false);
    expect(grid.find(day => day.key === '2026-10-31')?.inMonth).toBe(true);
    expect(grid.filter(day => day.isToday).map(day => day.key)).toEqual(['2026-10-02']);
  });

  it('groups tasks by due day', () => {
    const a = makeTask({ deadline: '2026-10-05T00:00:00.000Z' });
    const b = makeTask({ deadline: '2026-10-05' });
    expect(groupByDeadline([a, b]).get('2026-10-05')).toEqual([a, b]);
  });
});

describe('buildTimeline', () => {
  const today = new Date(2026, 9, 2);
  const design = makeTask({ _id: 'design', startDate: '2026-10-01', deadline: '2026-10-05' });
  const build = makeTask({ _id: 'build', startDate: '2026-10-06', deadline: '2026-10-10', dependencies: ['design'] });
  const qa = makeTask({ _id: 'qa', startDate: '2026-10-04', deadline: '2026-10-12', dependencies: ['design', 'missing'] });

  const layout = buildTimeline([qa, build, design], { today, paddingDays: 2, minDays: 7 });

  it('pads the range around the earliest start and latest deadline', () => {
    expect(toDateKey(layout.start)).toBe('2026-09-29');
    expect(toDateKey(layout.days[layout.days.length - 1])).toBe('2026-10-14');
  });

  it('positions bars and sorts rows by start date', () => {
    expect(layout.rows.map(row => row.task._id)).toEqual(['design', 'qa', 'build']);
    expect(layout.rows[0]).toMatchObject({ offset: 2, span: 5 });
  });

  it('links dependencies and flags tasks starting before their prerequisite is due', () => {
    expect(layout.links).toEqual([
      { fromId: 'design', toId: 'qa', conflict: true },
      { fromId: 'design', toId: 'build', conflict: false },
    ]);
  });

  it('keeps a minimum width when there are no tasks', () => {
    expect(buildTimeline([], { today, minDays: 28 }).days).toHaveLength(28);
  });

  it('groups days into month header segments', () => {
    const days = [parseDateKey('2026-09-29'), parseDateKey('2026-09-30'), parseDateKey('2026-10-01')];
    expect(groupDaysByMonth(days)).toEqual([
      { label: 'September 2026', offset: 0, span: 2 },
      { label: 'October 2026', offset: 2, span: 1 },
    ]);
  });
});

describe('getLinkPath', () => {
  const row = (offset: number, span: number) => ({ task: makeTask(), offset, span });

  it('draws a simple elbow when there is room between bars', () => {
    expect(getLinkPath(row(0, 2), row(4, 1), 0, 1, 10, 40)).toBe('M18,20 H26 V60 H42');
  });

  it('routes around when the dependant starts too early', () => {
    expect(getLinkPath(row(0, 3), row(1, 1), 0, 1, 10, 40)).toBe('M28,20 H36 V40 H4 V60 H12');
  });
});
