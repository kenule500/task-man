import type { ReportItem, SprintReport } from '../lib/sprintReport';

export const item = (overrides: Partial<ReportItem> = {}): ReportItem => ({
  _id: 'i1', number: 1, title: 'Item', type: 'story', status: 'pending', project: 'Website', storyPoints: 3,
  assignees: [], completedAt: null, ...overrides,
});

export const total = (count: number, points: number) => ({ count, points });

export const makeReport = (overrides: Partial<SprintReport> = {}): SprintReport => ({
  sprint: {
    _id: 's1', project: 'p1', name: 'Sprint 7', goal: 'Ship checkout', startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-14T00:00:00.000Z',
    status: 'active', projectName: 'Website', projectKey: 'WEB', startedAt: '2026-10-01T08:00:00.000Z', completedAt: null,
  },
  summary: {
    committed: total(2, 8), completed: total(1, 5), notCompleted: total(1, 3), added: total(0, 0), removed: total(0, 0),
  },
  committed: [], completed: [], notCompleted: [], added: [], removed: [],
  ...overrides,
});
