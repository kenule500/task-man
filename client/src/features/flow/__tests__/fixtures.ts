import type { AgingItem, CfdDay, FlowReport, ThroughputWeek, TimePoint, TimeStats } from '../types';

export const cfdDay = (date: string, pending: number, inProgress: number, completed: number): CfdDay => ({
  date, pending, inProgress, completed,
});

export const point = (taskId: string, days: number, completedAt = '2026-10-05T12:00:00.000Z', title = `Task ${taskId}`): TimePoint => ({
  taskId, key: `WEB-${taskId}`, title, completedAt, days,
});

export const stats = (points: TimePoint[], extra: Partial<TimeStats> = {}): TimeStats => ({
  count: points.length,
  average: points.length ? points.reduce((sum, item) => sum + item.days, 0) / points.length : null,
  p50: points.length ? points[Math.floor((points.length - 1) / 2)].days : null,
  p85: points.length ? points[points.length - 1].days : null,
  p95: points.length ? points[points.length - 1].days : null,
  points,
  ...extra,
});

export const aging = (taskId: string, days: number, extra: Partial<AgingItem> = {}): AgingItem => ({
  taskId, key: `WEB-${taskId}`, title: `Aging ${taskId}`, project: 'Website', assignees: [], since: '2026-10-01T00:00:00.000Z', days, ...extra,
});

export const week = (label: string, start: string, count: number): ThroughputWeek => ({ week: label, start, count });

export const makeFlowReport = (overrides: Partial<FlowReport> = {}): FlowReport => ({
  range: { from: '2026-10-01', to: '2026-10-07', days: 7 },
  cfd: [
    cfdDay('2026-10-01', 3, 0, 0), cfdDay('2026-10-02', 2, 1, 0), cfdDay('2026-10-03', 2, 1, 0), cfdDay('2026-10-04', 1, 2, 0),
    cfdDay('2026-10-05', 1, 1, 1), cfdDay('2026-10-06', 1, 1, 1), cfdDay('2026-10-07', 0, 2, 1),
  ],
  cycleTime: stats([point('1', 2, '2026-10-05T12:00:00.000Z'), point('2', 4, '2026-10-06T12:00:00.000Z'), point('3', 8, '2026-10-07T12:00:00.000Z')]),
  leadTime: stats([point('1', 5), point('2', 7), point('3', 9)]),
  aging: [aging('4', 9, { assignees: [{ _id: 'u1', name: 'Ana Diaz' }] }), aging('5', 5), aging('6', 1)],
  throughput: [week('2026-W40', '2026-09-28', 0), week('2026-W41', '2026-10-05', 3)],
  ...overrides,
});

export const emptyFlowReport = (): FlowReport => makeFlowReport({
  cfd: [cfdDay('2026-10-01', 0, 0, 0), cfdDay('2026-10-02', 0, 0, 0)],
  cycleTime: stats([]),
  leadTime: stats([]),
  aging: [],
  throughput: [week('2026-W40', '2026-09-28', 0)],
});
