import type { AiPlan, PlanContent, PlanItem } from '../types';

export const makeItem = (overrides: Partial<PlanItem> = {}): PlanItem => ({
  ref: 'T1',
  sprintIndex: 0,
  epicRef: null,
  title: 'Browse the catalogue',
  description: 'Show books in a paged list.',
  type: 'story',
  priority: 'high',
  storyPoints: 5,
  labels: ['web'],
  acceptanceCriteria: ['Given a visitor, when they open the shop, then books are listed', 'Pagination keeps the filter'],
  subtasks: [
    { title: 'Build the list page', acceptanceCriteria: ['Renders 20 books'] },
    { title: 'Write the list tests', acceptanceCriteria: [] },
  ],
  ...overrides,
});

export const makePlan = (overrides: Partial<PlanContent> = {}): PlanContent => ({
  project: { name: 'Online Bookshop', key: 'BOOK', description: 'A shop that sells books online.', color: 'teal' },
  sprints: [
    { name: 'Sprint 1', goal: 'Browse and search', startDate: '2031-03-03', endDate: '2031-03-14' },
    { name: 'Sprint 2', goal: 'Pay and fulfil', startDate: '2031-03-17', endDate: '2031-03-28' },
  ],
  epics: [{ ref: 'E1', title: 'Catalogue', description: 'Browse and search books' }],
  items: [
    makeItem({ epicRef: 'E1' }),
    makeItem({
      ref: 'T2', sprintIndex: 1, title: 'Pay by card', description: 'Card checkout.', priority: 'medium', storyPoints: 8,
      acceptanceCriteria: ['Given a basket, when the card is accepted, then an order is created'], subtasks: [],
    }),
    makeItem({
      ref: 'T3', sprintIndex: null, title: 'Gift cards', description: '', type: 'task', priority: 'low', storyPoints: null,
      acceptanceCriteria: [], subtasks: [],
    }),
  ],
  assumptions: ['Card payments only'],
  risks: ['Payment provider approval takes weeks'],
  ...overrides,
});

export const makeAiPlan = (overrides: Partial<AiPlan> = {}): AiPlan => ({
  _id: 'plan-1',
  status: 'ready',
  source: { fileName: 'bookshop.pdf', mimeType: 'application/pdf', size: 123_456, chars: 8200, truncated: false, preview: 'Online bookshop requirements' },
  options: { projectName: '', projectKey: '', sprintLengthWeeks: 2, startDate: '2031-03-03', teamSize: null, extraInstructions: '', language: 'en' },
  counts: { sprints: 2, epics: 1, items: 3, subtasks: 2, criteria: 5, points: 13 },
  model: 'qwen-plus',
  usage: { inputTokens: 1500, outputTokens: 700 },
  error: '',
  errorCode: '',
  projectId: null,
  createdAt: '2031-03-01T10:00:00.000Z',
  startedAt: '2031-03-01T10:00:01.000Z',
  completedAt: '2031-03-01T10:01:10.000Z',
  plan: makePlan(),
  ...overrides,
});
