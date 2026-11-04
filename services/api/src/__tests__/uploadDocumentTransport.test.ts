import { analyzePlan, isInfrastructureFailure, type AnalyzePlanInput } from '../utils/ai/plan/analyzer.js';
import type { AnalyzerConfig } from '../utils/ai/plan/config.js';
import { planView } from '../controllers/aiPlanController.js';

// The wire contract between the API and services/document-analyzer: one request per plan, the
// fields the analyzer needs, and the error codes the fallback policy depends on.

const config: AnalyzerConfig = {
  mode: 'documind',
  url: 'https://analyzer.test',
  token: 'x'.repeat(40),
  configured: true,
  timeoutMs: 5_000,
  fallback: false,
  maxChars: 24_000,
  maxBytes: 2 * 1024 * 1024,
};

const input: AnalyzePlanInput = {
  fileName: 'brief.md',
  mimeType: 'text/markdown',
  text: 'The clinic needs appointments.',
  options: {
    projectName: 'Clinic',
    projectKey: 'CLINIC',
    sprintLengthWeeks: 2,
    startDate: '2026-11-02',
    teamSize: 4,
    extraInstructions: 'Keep it small',
    language: 'fr',
    targetProjectId: 'project-1',
  },
};

const plan = {
  project: { name: 'Clinic', key: 'CLINIC', description: '', color: 'blue' },
  sprints: [],
  epics: [],
  items: [{
    ref: 'T1', sprintIndex: null, epicRef: null, title: 'Book an appointment', description: '',
    type: 'story', priority: 'medium', storyPoints: 3, labels: [], acceptanceCriteria: [], subtasks: [],
  }],
  assumptions: [],
  risks: [],
};

const REQUEST_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

type FetchCall = [string, { method: string; headers: Record<string, string>; body: string }];

const okFetch = () => jest.fn(async () => new Response(JSON.stringify({
  contractVersion: 1,
  requestId: REQUEST_ID,
  plan,
  analyzer: { model: 'documind-x', latencyMs: 9 },
}), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as jest.Mock;

const errorFetch = (status: number, code: string, message = 'refused') =>
  (async () => new Response(JSON.stringify({ requestId: REQUEST_ID, code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch;

describe('the analyzer transport', () => {
  it('AC-047: sends exactly one request for one plan, carrying the same correlation id', async () => {
    const fetchMock = okFetch();

    await analyzePlan(input, config, fetchMock as unknown as typeof fetch, REQUEST_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as FetchCall;
    expect(url).toBe('https://analyzer.test/v1/plans:analyze');
    expect(init.method).toBe('POST');
    expect(init.headers['x-request-id']).toBe(REQUEST_ID);
    expect(init.headers.authorization).toBe(`Bearer ${config.token}`);
  });

  it('AC-048: builds the request the contract describes', async () => {
    const fetchMock = okFetch();

    await analyzePlan(input, config, fetchMock as unknown as typeof fetch, REQUEST_ID);

    const [, init] = fetchMock.mock.calls[0] as FetchCall;
    const body = JSON.parse(init.body) as {
      contractVersion: number;
      requestId: string;
      document: { fileName: string; mimeType: string; text: string };
      options: Record<string, unknown>;
    };

    expect(body.contractVersion).toBe(1);
    expect(body.requestId).toBe(REQUEST_ID);
    // The cleaned text, never the file: the service is handed what Node already read
    expect(body.document).toEqual({
      fileName: 'brief.md',
      mimeType: 'text/markdown',
      text: 'The clinic needs appointments.',
    });
    expect(body.options).toEqual({
      projectName: 'Clinic',
      projectKey: 'CLINIC',
      sprintLengthWeeks: 2,
      startDate: '2026-11-02',
      teamSize: 4,
      extraInstructions: 'Keep it small',
      language: 'fr',
      existingProject: true,
    });
  });

  it('AC-050: reports a timeout and a busy service with the codes the fallback may cover', async () => {
    const abort = async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };

    await expect(analyzePlan(input, config, abort as unknown as typeof fetch)).rejects.toMatchObject({
      code: 'ANALYZER_TIMEOUT',
    });
    await expect(analyzePlan(input, config, errorFetch(429, 'ANALYZER_RATE_LIMITED'))).rejects.toMatchObject({
      code: 'ANALYZER_RATE_LIMITED',
    });

    expect(isInfrastructureFailure('ANALYZER_TIMEOUT')).toBe(true);
    expect(isInfrastructureFailure('ANALYZER_RATE_LIMITED')).toBe(true);
    expect(isInfrastructureFailure('ANALYZER_UNAVAILABLE')).toBe(true);
  });

  it('AC-051: reports a refused token and an unusable answer as failures no fallback may cover', async () => {
    await expect(analyzePlan(input, config, errorFetch(401, 'ANALYZER_UNAUTHORIZED'))).rejects.toMatchObject({
      code: 'ANALYZER_UNAUTHORIZED',
    });
    await expect(analyzePlan(input, config, errorFetch(422, 'ANALYZER_INVALID_OUTPUT'))).rejects.toMatchObject({
      code: 'ANALYZER_INVALID_OUTPUT',
    });

    expect(isInfrastructureFailure('ANALYZER_UNAUTHORIZED')).toBe(false);
    expect(isInfrastructureFailure('ANALYZER_INVALID_OUTPUT')).toBe(false);
  });
});

describe('the plan view', () => {
  type PlanForView = Parameters<typeof planView>[0];

  const stored = {
    _id: 'plan-1',
    status: 'ready' as const,
    source: { fileName: 'brief.md', mimeType: 'text/markdown', size: 1, chars: 1, truncated: false, preview: 'x' },
    options: {
      projectName: '', projectKey: '', sprintLengthWeeks: 2, startDate: '2026-11-02',
      teamSize: null, extraInstructions: '', language: 'en' as const, targetProjectId: null,
    },
    model: 'documind-x',
    usage: { inputTokens: 0, outputTokens: 0 },
    analyzer: 'documind' as const,
    error: '',
    errorCode: '',
    projectId: null,
    createdAt: new Date('2026-11-02T10:00:00.000Z'),
  };

  it('AC-055: exposes which engine produced the plan, the model, and the usage it reported', () => {
    const view = planView(stored as unknown as PlanForView, true);

    expect(view.analyzer).toBe('documind');
    expect(view.model).toBe('documind-x');
    // DocuMind reports no token counts: the shape stays, and no number is invented
    expect(view.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('AC-055: reports the v1 provider path for records written before the analyzer existed', () => {
    const { analyzer: _omitted, ...legacy } = stored;

    expect(planView(legacy as unknown as PlanForView, false).analyzer).toBe('ai');
  });
});
