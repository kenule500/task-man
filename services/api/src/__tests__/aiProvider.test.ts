import { isRetryable, reviewWithModel, describeProviderError, type ChatClient } from '../utils/ai/provider.js';
import { AiReviewError, type ReviewModelInput } from '../utils/ai/types.js';

const input: ReviewModelInput = {
  ticket: { key: 'TM-1', title: 't', description: '', criteria: ['one'], criteriaSource: 'explicit' },
  pr: { title: 'p', body: '', repo: 'a/b', number: 1, headSha: 'x', baseRef: 'main', headRef: 'f' },
  manifest: [{ filename: 'a.ts', status: 'modified', additions: 1, deletions: 0 }],
  selection: { included: [], withoutDiff: [], omittedFiles: [], truncated: false, totalChars: 0 },
};

const good = JSON.stringify({ verdict: 'match', summary: 's', criteria: [{ index: 1, status: 'met', evidence: [{ file: 'a.ts', note: 'n' }] }], issues: [] });
const reply = (content: string | null, usage = { prompt_tokens: 100, completion_tokens: 20 }) => ({ choices: [{ message: { content } }], usage });
const httpError = (status: number) => Object.assign(new Error(`status ${status} with secret body sk-leak`), { status });

const clientFrom = (steps: (() => unknown)[]) => {
  const create = jest.fn(async () => {
    const step = steps.shift();
    if (!step) throw new Error('unexpected call');
    return step();
  });
  return { client: { chat: { completions: { create } } } as unknown as ChatClient, create };
};
// Tests use a fake client, so the workspace model is passed explicitly instead of loading a workspace.
const fast = { sleep: jest.fn(async () => undefined), model: 'qwen-test' };

beforeEach(() => {
  fast.sleep.mockClear();
});

describe('reviewWithModel', () => {
  it('TEST-023 AC-023: asks for JSON mode with the configured model and returns the validated answer and token usage', async () => {
    const { client, create } = clientFrom([() => reply(good)]);
    const result = await reviewWithModel(input, { client, ...fast });
    expect(result.output.verdict).toBe('match');
    expect(result.model).toBe('qwen-test');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    const [params, options] = create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params.response_format).toEqual({ type: 'json_object' });
    expect(params.model).toBe('qwen-test');
    expect(options).toMatchObject({ timeout: 120_000, maxRetries: 0 });
  });

  it('TEST-024 AC-024: retries 429 and 5xx twice, then gives up with a safe message', async () => {
    const { client, create } = clientFrom([() => { throw httpError(429); }, () => { throw httpError(503); }, () => { throw httpError(500); }]);
    const error = await reviewWithModel(input, { client, ...fast }).catch((e: unknown) => e);
    expect(create).toHaveBeenCalledTimes(3);
    expect(fast.sleep).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(AiReviewError);
    expect((error as Error).message).not.toContain('sk-leak');
  });

  it('AC-024: succeeds when a retry works', async () => {
    const { client, create } = clientFrom([() => { throw httpError(502); }, () => reply(good)]);
    const result = await reviewWithModel(input, { client, ...fast });
    expect(result.output.summary).toBe('s');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('AC-024: does not retry other client errors', async () => {
    const { client, create } = clientFrom([() => { throw httpError(401); }]);
    await expect(reviewWithModel(input, { client, ...fast })).rejects.toMatchObject({ code: 'AI_AUTH' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('AC-024: sends the validation error back once and accepts the corrected answer; usage adds up', async () => {
    const { client, create } = clientFrom([() => reply('{"verdict":"great"}'), () => reply(good)]);
    const result = await reviewWithModel(input, { client, ...fast });
    expect(result.output.verdict).toBe('match');
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 40 });
    const secondMessages = (create.mock.calls[1] as unknown as [{ messages: { role: string; content: string }[] }])[0].messages;
    expect(secondMessages.at(-1)?.content).toMatch(/verdict/);
    expect(secondMessages.at(-2)?.role).toBe('assistant');
  });

  it('AC-024: fails after one repair attempt when the answer is still invalid', async () => {
    const { client, create } = clientFrom([() => reply('nope'), () => reply('still nope')]);
    await expect(reviewWithModel(input, { client, ...fast })).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('AC-024: fails on an empty answer', async () => {
    const { client } = clientFrom([() => reply(null)]);
    await expect(reviewWithModel(input, { client, ...fast })).rejects.toMatchObject({ code: 'AI_EMPTY' });
  });

  it('AC-023/AC-027: refuses to run without a workspace configuration', async () => {
    await expect(reviewWithModel(input)).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });
});

describe('provider error helpers', () => {
  it('AC-024: retries only 429 and 5xx', () => {
    expect([429, 500, 502, 503].every(status => isRetryable(httpError(status)))).toBe(true);
    expect([400, 401, 403, 404].some(status => isRetryable(httpError(status)))).toBe(false);
    expect(isRetryable(new Error('boom'))).toBe(false);
  });

  it('AC-024/AC-025: describes errors without leaking provider text', () => {
    for (const status of [400, 401, 429, 500]) expect(describeProviderError(httpError(status)).message).not.toContain('sk-leak');
    expect(describeProviderError(Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' })).code).toBe('AI_TIMEOUT');
  });
});
