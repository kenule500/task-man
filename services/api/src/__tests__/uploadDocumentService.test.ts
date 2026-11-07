import { Types } from 'mongoose';
import AiPlan from '../models/aiPlanModel.js';
import Project from '../models/projectModel.js';
import Workspace from '../models/workspaceModel.js';
import { analyzePlan } from '../utils/ai/plan/analyzer.js';
import type { PlanContent } from '../utils/ai/plan/schema.js';
import { assertCanQueuePlan, runPlan } from '../utils/ai/plan/service.js';
import { generateJson } from '../utils/ai/provider.js';
import { AiReviewError } from '../utils/ai/types.js';

// runPlan's policy: which path produced the plan, what is stored, and when a failure may fall
// back to the v1 provider. The models and the analyzer are replaced; the finaliser is real.

jest.mock('../models/aiPlanModel.js', () => ({
  __esModule: true,
  MAX_PLAN_PREVIEW: 2000,
  default: {
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    exists: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../models/workspaceModel.js', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

jest.mock('../models/projectModel.js', () => ({
  ...jest.requireActual('../models/projectModel.js'),
  __esModule: true,
  default: { find: jest.fn() },
}));

jest.mock('../utils/ai/plan/analyzer.js', () => ({
  ...jest.requireActual('../utils/ai/plan/analyzer.js'),
  analyzePlan: jest.fn(),
}));

jest.mock('../utils/ai/plan/events.js', () => ({
  publishPlanUpdated: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/ai/provider.js', () => ({ generateJson: jest.fn() }));

jest.mock('../utils/ai/workspaceConfig.js', () => ({
  ...jest.requireActual('../utils/ai/workspaceConfig.js'),
  resolveWorkspaceAiConfig: jest.fn(() => ({
    available: true,
    provider: { id: 'openai', label: 'OpenAI' },
    model: 'gpt-4o',
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    keySet: true,
    keyHint: 'test',
    problem: null,
    limits: {},
  })),
}));

const AiPlanMock = AiPlan as unknown as Record<string, jest.Mock>;
const WorkspaceMock = Workspace as unknown as Record<string, jest.Mock>;
const ProjectMock = Project as unknown as Record<string, jest.Mock>;
const analyzePlanMock = analyzePlan as jest.MockedFunction<typeof analyzePlan>;
const generateJsonMock = generateJson as unknown as jest.Mock;

const planDoc = {
  _id: 'p1',
  workspace: 'w1',
  createdBy: 'u1',
  status: 'queued',
  source: { fileName: 'brief.md', mimeType: 'text/markdown', size: 100, chars: 100, truncated: false, preview: '' },
  options: {
    projectName: '', projectKey: '', sprintLengthWeeks: 2, startDate: '2026-11-02',
    teamSize: null, extraInstructions: '', language: 'en', targetProjectId: null,
  },
  model: 'planned-model',
};

const workspaceDoc = { _id: 'w1', ai: { enabled: true } };

/** Everything finalizePlan fills in itself: empty sprint window, empty name. */
const servicePlan: PlanContent = {
  project: { name: 'Clinic', key: 'CLINIC', description: '', color: 'blue' },
  sprints: [{ name: '', goal: '', startDate: '', endDate: '' }],
  epics: [],
  items: [{
    ref: 'T1', sprintIndex: 0, epicRef: null, title: 'Book an appointment', description: '',
    type: 'story', priority: 'medium', storyPoints: 3, labels: [], acceptanceCriteria: [], subtasks: [],
  }],
  assumptions: [],
  risks: [],
};

const savedWithStatus = (status: string) => {
  const call = AiPlanMock.findOneAndUpdate.mock.calls
    .map(([, update]) => update as { $set?: Record<string, unknown> })
    .find(update => update?.$set?.status === status);
  return call?.$set as Record<string, any> | undefined;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DOCUMENT_ANALYZER_MODE = 'documind';
  process.env.DOCUMENT_ANALYZER_URL = 'https://analyzer.test';
  process.env.DOCUMENT_ANALYZER_TOKEN = 'x'.repeat(40);
  process.env.NODE_ENV = 'test';
  delete process.env.DOCUMENT_ANALYZER_FALLBACK;
  delete process.env.DOCUMENT_ANALYZER_MAX_CHARS;
  delete process.env.AI_PLAN_MAX_CHUNKS;
  delete process.env.AI_PLAN_DAILY_LIMIT;

  AiPlanMock.findOneAndUpdate.mockImplementation(async (_filter: unknown, update: { $set?: Record<string, unknown> }) => ({
    ...planDoc,
    ...(update?.$set ?? {}),
  }));
  AiPlanMock.updateOne.mockResolvedValue({});
  AiPlanMock.updateMany.mockResolvedValue({});
  AiPlanMock.exists.mockResolvedValue(false);
  AiPlanMock.countDocuments.mockResolvedValue(0);
  WorkspaceMock.findById.mockReturnValue({ select: () => ({ lean: async () => workspaceDoc }) });
  ProjectMock.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  analyzePlanMock.mockReset();
  generateJsonMock.mockReset();
});

describe('runPlan on the analyzer path', () => {
  it('AC-048: stores analyzer documind, the model the service reported, and no invented usage', async () => {
    analyzePlanMock.mockResolvedValue({ plan: servicePlan, model: 'documind-x', latencyMs: 4 });

    await runPlan('p1', { text: 'short brief', truncated: false });

    const ready = savedWithStatus('ready');
    expect(ready).toMatchObject({
      analyzer: 'documind',
      model: 'documind-x',
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it('AC-048: plans a long document page by page and merges the answers', async () => {
    analyzePlanMock.mockResolvedValue({ plan: servicePlan, model: 'documind-x', latencyMs: 4 });
    // Pinned, so the test does not depend on a local .env value: 3,000 characters is five pages
    process.env.DOCUMENT_ANALYZER_MAX_CHARS = '1000';

    await runPlan('p1', { text: 'x'.repeat(3_000), truncated: false });

    // One analyzer request per page instead of one trimmed call
    expect(analyzePlanMock.mock.calls.length).toBeGreaterThan(1);
    // Every page sent fits the analyzer's own cap (the bug this replaces trimmed instead)
    for (const [input] of analyzePlanMock.mock.calls) expect(input.text.length).toBeLessThanOrEqual(1_000);
    // Progress is recorded and pushed, so the waiting screen can show it
    const progressWrites = AiPlanMock.findOneAndUpdate.mock.calls
      .map(([, update]) => update as { $set?: { progress?: { total: number; done: number } } })
      .filter(update => update?.$set?.progress);
    expect(progressWrites[0]?.$set?.progress).toEqual({ total: 5, done: 0 });
    expect(progressWrites.at(-1)?.$set?.progress).toEqual({ total: 5, done: 5 });
    // The pages were merged into one stored plan, not left as five
    expect(savedWithStatus('ready')?.plan.items.length).toBeGreaterThanOrEqual(1);
  });

  it('AC-048: marks the plan partial when the document needs more pages than the cap allows', async () => {
    analyzePlanMock.mockResolvedValue({ plan: servicePlan, model: 'documind-x', latencyMs: 4 });
    process.env.DOCUMENT_ANALYZER_MAX_CHARS = '1000';
    process.env.AI_PLAN_MAX_CHUNKS = '2';

    await runPlan('p1', { text: 'x'.repeat(20_000), truncated: false });

    // Only the cap was asked for, never the whole document
    expect(analyzePlanMock).toHaveBeenCalledTimes(2);
    expect(AiPlanMock.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      { $set: { 'source.truncated': true } },
    );
  });

  it('AC-048: recovers a page the model could not answer by splitting it in two', async () => {
    process.env.DOCUMENT_ANALYZER_MAX_CHARS = '1000';
    // The first page is unreadable once; its two halves (and every later page) answer fine
    analyzePlanMock
      .mockRejectedValueOnce(new AiReviewError('The generated document must contain one fenced JSON block.', 'ANALYZER_INVALID_OUTPUT'))
      .mockResolvedValue({ plan: servicePlan, model: 'documind-x', latencyMs: 4 });

    await runPlan('p1', { text: 'x'.repeat(3_000), truncated: false });

    // 1 failed page + its 2 halves + the 4 other pages = 7 requests, and the plan is ready (not lost)
    expect(analyzePlanMock).toHaveBeenCalledTimes(7);
    expect(savedWithStatus('ready')).toBeDefined();
    expect(savedWithStatus('failed')).toBeUndefined();
    // Recovered, not skipped: the document was planned in full, so it is not marked partial
    expect(AiPlanMock.updateOne).not.toHaveBeenCalledWith(
      { _id: 'p1' },
      { $set: { 'source.truncated': true } },
    );
  });

  it('AC-048: keeps the pages already planned when a later page cannot be read and its halves cannot help', async () => {
    process.env.DOCUMENT_ANALYZER_MAX_CHARS = '1000';
    // The first page answers; then the second page fails and so do its halves (too small to split again)
    analyzePlanMock
      .mockResolvedValueOnce({ plan: servicePlan, model: 'documind-x', latencyMs: 4 })
      .mockRejectedValue(new AiReviewError('The generated document must contain one fenced JSON block.', 'ANALYZER_INVALID_OUTPUT'));

    await runPlan('p1', { text: 'x'.repeat(3_000), truncated: false });

    expect(savedWithStatus('ready')).toBeDefined();
    expect(savedWithStatus('failed')).toBeUndefined();
    expect(AiPlanMock.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      { $set: { 'source.truncated': true } },
    );
  });

  it('AC-048: keeps the pages already planned when a later page times out', async () => {
    process.env.DOCUMENT_ANALYZER_MAX_CHARS = '1000';
    // The first page answers; the second page and its halves all time out
    analyzePlanMock
      .mockResolvedValueOnce({ plan: servicePlan, model: 'documind-x', latencyMs: 4 })
      .mockRejectedValue(new AiReviewError('The analyzer took too long.', 'ANALYZER_TIMEOUT'));

    await runPlan('p1', { text: 'x'.repeat(3_000), truncated: false });

    expect(savedWithStatus('ready')).toBeDefined();
    expect(savedWithStatus('failed')).toBeUndefined();
    expect(AiPlanMock.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      { $set: { 'source.truncated': true } },
    );
  });

  it('AC-048: still fails the plan when the very first page has no readable plan (nothing to keep)', async () => {
    process.env.DOCUMENT_ANALYZER_MAX_CHARS = '1000';
    analyzePlanMock.mockRejectedValue(new AiReviewError('The generated document must contain one fenced JSON block.', 'ANALYZER_INVALID_OUTPUT'));

    await runPlan('p1', { text: 'x'.repeat(3_000), truncated: false });

    expect(savedWithStatus('failed')).toMatchObject({ errorCode: 'ANALYZER_INVALID_OUTPUT' });
  });

  it('AC-048: still fails the plan when the very first page times out (nothing to keep)', async () => {
    process.env.DOCUMENT_ANALYZER_MAX_CHARS = '1000';
    analyzePlanMock.mockRejectedValue(new AiReviewError('The analyzer took too long.', 'ANALYZER_TIMEOUT'));

    await runPlan('p1', { text: 'x'.repeat(3_000), truncated: false });

    expect(savedWithStatus('failed')).toMatchObject({ errorCode: 'ANALYZER_TIMEOUT' });
  });

  it('AC-048: keeps planning several pages when the pages are fast (the budget does not stop at one)', async () => {
    process.env.DOCUMENT_ANALYZER_MAX_CHARS = '1000';
    // 3,000 characters is five pages; a fast provider must plan all five
    analyzePlanMock.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 2));
      return { plan: servicePlan, model: 'documind-x', latencyMs: 2 };
    });

    await runPlan('p1', { text: 'x'.repeat(3_000), truncated: false });

    expect(analyzePlanMock).toHaveBeenCalledTimes(5);
  });

  it('AC-049: finalises the plan the service returned before storing it', async () => {
    analyzePlanMock.mockResolvedValue({ plan: servicePlan, model: 'documind-x', latencyMs: 4 });

    await runPlan('p1', { text: 'short brief', truncated: false });

    const ready = savedWithStatus('ready');
    const sprint = ready?.plan.sprints[0];
    // The service sent an empty window; only finalizePlan computes it from the requested options
    expect(sprint.name).toBe('Sprint 1');
    expect(sprint.startDate).toBe('2026-11-02');
    expect(sprint.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ready?.plan).not.toBe(servicePlan);
  });
});

describe('the fallback policy', () => {
  it('AC-050: falls back to the provider on an infrastructure failure when the flag is on', async () => {
    process.env.DOCUMENT_ANALYZER_FALLBACK = 'true';
    analyzePlanMock.mockRejectedValue(new AiReviewError('down', 'ANALYZER_UNAVAILABLE'));
    generateJsonMock.mockResolvedValue({ output: servicePlan, model: 'gpt-4o', usage: { inputTokens: 5, outputTokens: 7 } });

    await runPlan('p1', { text: 'short brief', truncated: false });

    expect(generateJsonMock).toHaveBeenCalledTimes(1);
    expect(savedWithStatus('ready')).toMatchObject({ analyzer: 'ai', model: 'gpt-4o' });
  });

  it('AC-050: fails with the analyzer code when the flag is off', async () => {
    analyzePlanMock.mockRejectedValue(new AiReviewError('down', 'ANALYZER_UNAVAILABLE'));

    await runPlan('p1', { text: 'short brief', truncated: false });

    expect(generateJsonMock).not.toHaveBeenCalled();
    expect(savedWithStatus('failed')).toMatchObject({ errorCode: 'ANALYZER_UNAVAILABLE' });
  });

  it('AC-051: never falls back on an unusable plan or a refused token', async () => {
    process.env.DOCUMENT_ANALYZER_FALLBACK = 'true';

    for (const code of ['ANALYZER_INVALID_OUTPUT', 'ANALYZER_UNAUTHORIZED']) {
      AiPlanMock.findOneAndUpdate.mockClear();
      analyzePlanMock.mockRejectedValue(new AiReviewError('refused', code));

      await runPlan('p1', { text: 'short brief', truncated: false });

      expect(generateJsonMock).not.toHaveBeenCalled();
      expect(savedWithStatus('failed')).toMatchObject({ errorCode: code });
    }
  });

  it('AC-051: refuses the daily limit and a disabled AI feature before any work starts', async () => {
    process.env.AI_PLAN_DAILY_LIMIT = '1';
    AiPlanMock.countDocuments.mockResolvedValue(1);
    const scope = { workspaceId: new Types.ObjectId(), userId: new Types.ObjectId() };

    await expect(assertCanQueuePlan({ ...scope, settings: { enabled: true } }))
      .rejects.toMatchObject({ status: 429, code: 'AI_DAILY_LIMIT' });

    await expect(assertCanQueuePlan({ ...scope, settings: { enabled: false } }))
      .rejects.toMatchObject({ status: 503, code: 'AI_DISABLED' });
  });
});
