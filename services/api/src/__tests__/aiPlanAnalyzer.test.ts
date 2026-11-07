import { analyzePlan, type AnalyzePlanInput } from '../utils/ai/plan/analyzer.js';
import type { AnalyzerConfig } from '../utils/ai/plan/config.js';

const config: AnalyzerConfig = {
  mode: 'documind',
  url: 'http://127.0.0.1:8000',
  token: 'x'.repeat(40),
  configured: true,
  timeoutMs: 5_000,
  fallback: false,
  maxChars: 24_000,
  maxBytes: 2 * 1024 * 1024,
};

/** The workspace provider block the API always sends, so the pipeline runs on that workspace's account. */
const workspaceLlm = { model: 'qwen-plus', apiKey: 'sk-workspace', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' };

const input: AnalyzePlanInput = {
  fileName: 'brief.txt',
  mimeType: 'text/plain',
  text: 'The clinic needs appointments.',
  options: {
    projectName: '', projectKey: '', sprintLengthWeeks: 2, startDate: '2026-11-02',
    teamSize: null, extraInstructions: '', language: 'en', targetProjectId: null,
  },
  llm: workspaceLlm,
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

/** A fetch that always answers with `body`; the analyzer client is the only thing under test. */
const reply = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

/** A fetch that records the request body it was given. */
const capture = () => {
  const bodies: Record<string, any>[] = [];
  const fetchImpl = (async (_url: string, init: { body?: string }) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({
      contractVersion: 1, requestId: 'r', plan, analyzer: { model: 'documind', latencyMs: 12 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { bodies, fetchImpl };
};

describe('analyzePlan', () => {
  it('sends the workspace provider with the request, so the plan runs on that workspace', async () => {
    const { bodies, fetchImpl } = capture();
    await analyzePlan(input, config, fetchImpl);

    expect(bodies[0].llm).toEqual(workspaceLlm);
    // The rest of the contract is unchanged by the extra block
    expect(bodies[0].document.text).toBe(input.text);
    expect(bodies[0].options.startDate).toBe('2026-11-02');
  });

  it('returns the plan the service validated', async () => {
    const result = await analyzePlan(input, config, reply(200, {
      contractVersion: 1, requestId: 'r', plan, analyzer: { model: 'documind', latencyMs: 12 },
    }));
    expect(result.model).toBe('documind');
    expect(result.latencyMs).toBe(12);
    expect(result.plan.items[0]).toMatchObject({ ref: 'T1', title: 'Book an appointment' });
  });

  it('keeps the service code and sentence when the plan is refused', async () => {
    const run = analyzePlan(input, config, reply(422, {
      requestId: 'r',
      code: 'ANALYZER_INVALID_OUTPUT',
      message: 'The generated document must contain one fenced JSON block.',
    }));
    await expect(run).rejects.toMatchObject({
      code: 'ANALYZER_INVALID_OUTPUT',
      message: 'The generated document must contain one fenced JSON block.',
    });
  });

  it('reports a body that is too large as its own code', async () => {
    const run = analyzePlan(input, config, reply(413, {
      requestId: 'r', code: 'ANALYZER_BODY_TOO_LARGE', message: 'The request body is too large.',
    }));
    await expect(run).rejects.toMatchObject({ code: 'ANALYZER_BODY_TOO_LARGE' });
  });

  it('keeps the timeout code of a failed service so the fallback policy still applies', async () => {
    const run = analyzePlan(input, config, reply(504, {
      requestId: 'r', code: 'ANALYZER_TIMEOUT', message: 'The analyzer took too long.',
    }));
    await expect(run).rejects.toMatchObject({ code: 'ANALYZER_TIMEOUT' });
  });

  it('does not send a refused request twice when the service is busy', async () => {
    let calls = 0;
    const busy = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ requestId: 'r', code: 'ANALYZER_RATE_LIMITED', message: 'The analyzer is busy.' }), {
        status: 429, headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    await expect(analyzePlan(input, config, busy)).rejects.toMatchObject({ code: 'ANALYZER_RATE_LIMITED' });
    expect(calls).toBe(1);
  });

  it('retries once when the connection itself failed', async () => {
    let calls = 0;
    const refused = (async () => {
      calls += 1;
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }) as unknown as typeof fetch;
    await expect(analyzePlan(input, config, refused)).rejects.toMatchObject({ code: 'ANALYZER_UNAVAILABLE' });
    expect(calls).toBe(2);
  });

  it('does not retry a failure that happened after the request was sent', async () => {
    let calls = 0;
    const reset = (async () => {
      calls += 1;
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    }) as unknown as typeof fetch;
    await expect(analyzePlan(input, config, reset)).rejects.toMatchObject({ code: 'ANALYZER_UNAVAILABLE' });
    expect(calls).toBe(1);
  });
});
