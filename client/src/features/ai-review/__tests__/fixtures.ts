import type { AiReview, AiSettings } from '../types';

export const settings = (overrides: Partial<AiSettings> = {}): AiSettings => ({
  available: true, enabled: true, autoReview: false, model: 'qwen-max', dailyLimit: 50, usedToday: 3, githubTokenSet: false, ...overrides,
});

export const review = (overrides: Partial<AiReview> = {}): AiReview => ({
  _id: 'r1',
  task: 'task-1',
  pr: { repo: 'acme/app', number: 7, url: 'https://github.com/acme/app/pull/7', title: 'Add login', headSha: 'abc1234' },
  status: 'completed',
  verdict: 'partial',
  summary: 'The form exists but the error message is missing.',
  criteriaSource: 'explicit',
  counts: { met: 1, partial: 0, missing: 1, issues: 2 },
  truncated: false,
  omittedFiles: [],
  model: 'qwen-max',
  usage: { inputTokens: 1200, outputTokens: 300 },
  error: '',
  requestedBy: { _id: 'u1', name: 'Ada Lovelace' },
  createdAt: '2026-10-16T10:00:00.000Z',
  startedAt: '2026-10-16T10:00:01.000Z',
  completedAt: '2026-10-16T10:01:00.000Z',
  criteria: [
    {
      text: 'A user can sign in with email and password', status: 'met',
      evidence: [{ file: 'src/login.ts', note: 'The form posts to /api/login.' }], explanation: 'Implemented in the login form.',
    },
    { text: 'A wrong password shows an error message', status: 'missing', evidence: [], explanation: 'No error state is rendered.' },
  ],
  issues: [
    { severity: 'high', category: 'security', file: 'src/login.ts', line: 12, message: 'The password is logged in clear text.' },
    { severity: 'low', category: 'tests', file: '', line: null, message: 'No test covers the empty password.' },
  ],
  ...overrides,
});
