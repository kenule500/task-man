import {
  agingWip, buildFlowReport, buildTimelines, cumulativeFlow, cycleTimes, isoWeekLabel, leadTimes, makeRange, parseDayKey, percentile,
  throughput, type FlowStatus, type FlowTask, type FlowTransition,
} from '../utils/flow/metrics.js';

const at = (day: number, hour = 12) => new Date(Date.UTC(2030, 0, day, hour));

const task = (id: string, status: FlowStatus, createdDay: number, extra: Partial<FlowTask> = {}): FlowTask => ({
  id, key: `T-${id}`, title: `Task ${id}`, project: '', status, createdAt: at(createdDay), ...extra,
});

const move = (id: string, from: FlowStatus | null, to: FlowStatus, day: number, hour = 12): FlowTransition => ({
  task: id, from, to, at: at(day, hour),
});

const range = makeRange('2030-01-01', '2030-01-14');

describe('parseDayKey and makeRange', () => {
  it('accepts real calendar days only', () => {
    expect(parseDayKey('2030-01-15')).toBe(Date.UTC(2030, 0, 15));
    expect(parseDayKey('2030-02-30')).toBeNull();
    expect(parseDayKey('2030-1-5')).toBeNull();
    expect(parseDayKey('tomorrow')).toBeNull();
  });

  it('counts both ends of the range', () => {
    expect(range.days).toBe(14);
    expect(range.end).toBe(Date.UTC(2030, 0, 15) - 1);
    expect(() => makeRange('2030-01-05', '2030-01-01')).toThrow(RangeError);
  });
});

describe('percentile', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it('uses the nearest rank', () => {
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 85)).toBe(9);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('buildTimelines', () => {
  it('backfills a task without transitions from its creation and current status', () => {
    const timelines = buildTimelines([], [task('a', 'in-progress', 3)]);
    expect(timelines.get('a')).toEqual([{ at: at(3).getTime(), status: 'in-progress' }]);
  });

  it('assumes the first recorded "from" as the status at creation', () => {
    const timelines = buildTimelines([move('a', 'pending', 'in-progress', 4)], [task('a', 'in-progress', 2)]);
    expect(timelines.get('a')).toEqual([
      { at: at(2).getTime(), status: 'pending' },
      { at: at(4).getTime(), status: 'in-progress' },
    ]);
  });

  it('appends a current status the log does not end with, at the last update', () => {
    const timelines = buildTimelines(
      [move('a', null, 'pending', 2)],
      [task('a', 'completed', 2, { completedAt: at(6), updatedAt: at(7) })],
    );
    expect(timelines.get('a')?.at(-1)).toEqual({ at: at(6).getTime(), status: 'completed' });
  });

  it('orders unsorted transitions and ignores other tasks', () => {
    const timelines = buildTimelines(
      [move('a', 'in-progress', 'completed', 5), move('a', null, 'pending', 2), move('a', 'pending', 'in-progress', 3), move('zzz', null, 'pending', 2)],
      [task('a', 'completed', 2)],
    );
    expect(timelines.get('a')?.map(step => step.status)).toEqual(['pending', 'in-progress', 'completed']);
    expect(timelines.has('zzz')).toBe(false);
  });
});

describe('cumulativeFlow', () => {
  it('counts tasks per status at the end of each day', () => {
    const tasks = [task('a', 'completed', 2), task('b', 'in-progress', 3), task('c', 'pending', 12)];
    const timelines = buildTimelines([
      move('a', null, 'pending', 2), move('a', 'pending', 'in-progress', 3), move('a', 'in-progress', 'completed', 5),
      move('b', null, 'pending', 3), move('b', 'pending', 'in-progress', 3, 18),
    ], tasks);
    const cfd = cumulativeFlow(timelines, range);
    const day = (n: number) => cfd[n - 1];

    expect(cfd).toHaveLength(14);
    expect(day(1)).toMatchObject({ date: '2030-01-01', pending: 0, inProgress: 0, completed: 0 });
    expect(day(2)).toMatchObject({ pending: 1, inProgress: 0, completed: 0 });
    // Task b moved twice on day 3: only the state at the end of the day counts
    expect(day(3)).toMatchObject({ pending: 0, inProgress: 2, completed: 0 });
    expect(day(5)).toMatchObject({ pending: 0, inProgress: 1, completed: 1 });
    expect(day(11)).toMatchObject({ pending: 0, inProgress: 1, completed: 1 });
    expect(day(12)).toMatchObject({ pending: 1, inProgress: 1, completed: 1 });
    expect(day(14)).toMatchObject({ date: '2030-01-14', pending: 1, inProgress: 1, completed: 1 });
  });

  it('keeps the earlier history of work finished before the range', () => {
    const tasks = [task('old', 'completed', 1)];
    const timelines = buildTimelines([], tasks);
    const later = makeRange('2030-01-10', '2030-01-12');
    expect(cumulativeFlow(timelines, later).map(day => day.completed)).toEqual([1, 1, 1]);
  });

  it('uses creation and current status for tasks without transitions', () => {
    const timelines = buildTimelines([], [task('a', 'in-progress', 4)]);
    const cfd = cumulativeFlow(timelines, range);
    expect(cfd[2].inProgress).toBe(0);
    expect(cfd[3].inProgress).toBe(1);
  });
});

describe('cycle and lead time', () => {
  const tasks = [task('a', 'completed', 1), task('b', 'completed', 2), task('c', 'completed', 1), task('d', 'in-progress', 1)];
  const transitions = [
    move('a', null, 'pending', 1), move('a', 'pending', 'in-progress', 2), move('a', 'in-progress', 'completed', 4),
    move('b', null, 'pending', 2), move('b', 'pending', 'in-progress', 3), move('b', 'in-progress', 'completed', 4),
    move('b', 'completed', 'in-progress', 6), move('b', 'in-progress', 'completed', 8),
    // Straight to completed: never started
    move('c', null, 'pending', 1), move('c', 'pending', 'completed', 5),
    move('d', null, 'pending', 1), move('d', 'pending', 'in-progress', 3),
  ];
  const timelines = buildTimelines(transitions, tasks);

  it('measures from the first entry into in-progress to the last completion', () => {
    const cycle = cycleTimes(timelines, tasks, range);
    expect(cycle.points.map(point => [point.taskId, point.days])).toEqual([['a', 2], ['b', 5]]);
    expect(cycle.points[1].completedAt).toBe(at(8).toISOString());
    expect(cycle).toMatchObject({ count: 2, average: 3.5, p50: 2, p85: 5, p95: 5 });
  });

  it('measures lead time from creation, including tasks that were never started', () => {
    const lead = leadTimes(timelines, tasks, range);
    expect(lead.points.map(point => [point.taskId, point.days])).toEqual([['a', 3], ['c', 4], ['b', 6]]);
    expect(lead).toMatchObject({ count: 3, p50: 4, p95: 6 });
    expect(lead.average).toBeCloseTo(4.33, 2);
  });

  it('only counts completions inside the range and reports nulls when there are none', () => {
    const early = cycleTimes(timelines, tasks, makeRange('2030-01-01', '2030-01-03'));
    expect(early).toMatchObject({ count: 0, average: null, p50: null, p85: null, p95: null, points: [] });
  });

  it('does not count a reopened task until it is completed again', () => {
    const open = buildTimelines(
      [move('a', null, 'pending', 1), move('a', 'pending', 'in-progress', 2), move('a', 'in-progress', 'completed', 4), move('a', 'completed', 'in-progress', 5)],
      [task('a', 'in-progress', 1)],
    );
    expect(cycleTimes(open, [task('a', 'in-progress', 1)], range).count).toBe(0);
  });
});

describe('agingWip', () => {
  it('lists in-progress tasks by days since they last entered in-progress, oldest first', () => {
    const tasks = [
      task('a', 'in-progress', 1, { assignees: ['u1'] }),
      task('b', 'in-progress', 1),
      task('c', 'completed', 1),
      task('d', 'in-progress', 9),
    ];
    const timelines = buildTimelines([
      move('a', null, 'pending', 1), move('a', 'pending', 'in-progress', 2),
      move('b', null, 'pending', 1), move('b', 'pending', 'in-progress', 3), move('b', 'in-progress', 'pending', 4), move('b', 'pending', 'in-progress', 8),
      move('c', null, 'pending', 1), move('c', 'pending', 'completed', 3),
    ], tasks);
    const aging = agingWip(timelines, tasks, at(10).getTime());

    expect(aging.map(item => [item.taskId, item.days])).toEqual([['a', 8], ['b', 2], ['d', 1]]);
    expect(aging[0]).toMatchObject({ key: 'T-a', assignees: ['u1'], since: at(2).toISOString() });
  });
});

describe('throughput', () => {
  it('counts completions per ISO week, including empty weeks', () => {
    // 2030-01-01 is a Tuesday, so the first ISO week starts on 2029-12-31
    const tasks = [task('a', 'completed', 1), task('b', 'completed', 1), task('c', 'completed', 1), task('d', 'pending', 1)];
    const timelines = buildTimelines([
      move('a', null, 'pending', 1), move('a', 'pending', 'completed', 2),
      move('b', null, 'pending', 1), move('b', 'pending', 'completed', 6),
      move('c', null, 'pending', 1), move('c', 'pending', 'completed', 7), move('c', 'completed', 'in-progress', 8), move('c', 'in-progress', 'completed', 22),
    ], tasks);
    const weeks = throughput(timelines, tasks, makeRange('2030-01-01', '2030-01-27'));

    expect(weeks.map(week => [week.week, week.start, week.count])).toEqual([
      ['2030-W01', '2029-12-31', 2],
      ['2030-W02', '2030-01-07', 0],
      ['2030-W03', '2030-01-14', 0],
      ['2030-W04', '2030-01-21', 1],
    ]);
  });

  it('labels ISO weeks across a year boundary', () => {
    expect(isoWeekLabel(Date.UTC(2029, 11, 31))).toBe('2030-W01');
    expect(isoWeekLabel(Date.UTC(2027, 0, 4))).toBe('2027-W01');
    expect(isoWeekLabel(Date.UTC(2026, 11, 28))).toBe('2026-W53');
  });
});

describe('buildFlowReport', () => {
  it('assembles every metric', () => {
    const tasks = [task('a', 'completed', 1), task('b', 'in-progress', 2)];
    const report = buildFlowReport(
      [move('a', null, 'pending', 1), move('a', 'pending', 'in-progress', 2), move('a', 'in-progress', 'completed', 3)],
      tasks,
      range,
      at(10).getTime(),
    );
    expect(report.cfd).toHaveLength(14);
    expect(report.cycleTime.count).toBe(1);
    expect(report.leadTime.count).toBe(1);
    expect(report.aging.map(item => item.taskId)).toEqual(['b']);
    expect(report.throughput.reduce((sum, week) => sum + week.count, 0)).toBe(1);
  });
});
