import OpenAI from 'openai';
import type { z } from 'zod';
import { readAiConfig } from './config.js';
import { buildMessages, buildRepairMessages, type ChatMessage } from './prompt.js';
import { parseJsonWith, parseModelOutput } from './schema.js';
import { AiReviewError, type ReviewModelInput, type ReviewModelResult } from './types.js';

// The only place that talks to the model. The endpoint and model come from the installation's provider
// preset (see providers.ts), always through the OpenAI-compatible client; callers use `reviewWithModel`,
// which tests replace with a fake.

export const REQUEST_TIMEOUT_MS = 120_000;
export const MAX_HTTP_RETRIES = 2;
/** Stop starting new attempts after this long, so the whole review fits in the function's time limit. */
const TOTAL_BUDGET_MS = 240_000;
const MAX_OUTPUT_TOKENS = 4096;

/** Per-call limits: the review keeps the defaults, a generated plan needs a longer answer and more time. */
interface CallLimits {
  maxTokens: number;
  timeoutMs: number;
}
const REVIEW_LIMITS: CallLimits = { maxTokens: MAX_OUTPUT_TOKENS, timeoutMs: REQUEST_TIMEOUT_MS };

/** The slice of the OpenAI client this module uses (so tests can pass a fake). */
export interface ChatClient {
  chat: {
    completions: {
      create(
        params: {
          model: string;
          messages: ChatMessage[];
          response_format: { type: 'json_object' };
          temperature: number;
          max_tokens: number;
        },
        options: { timeout: number; maxRetries: number },
      ): Promise<{
        choices: { message: { content: string | null }; finish_reason?: string | null }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
        model?: string;
      }>;
    };
  };
}

export interface ProviderOptions {
  client?: ChatClient;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export const createClient = (): ChatClient => {
  const config = readAiConfig();
  // A keyless `custom` endpoint is allowed (a local model server); the SDK still needs a non-empty
  // string. Hosted presets without a key are unavailable and never reach this point.
  const apiKey = config.apiKey || 'not-needed';
  return new OpenAI({ apiKey, baseURL: config.baseURL, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 }) as unknown as ChatClient;
};

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
};

/** Only rate limits and server errors are worth another try; a 4xx would fail the same way again. */
export const isRetryable = (error: unknown): boolean => {
  const status = statusOf(error);
  return status === 429 || (status !== undefined && status >= 500);
};

/** A message safe to show people: it never carries the provider's response body or the key. */
export const describeProviderError = (error: unknown): AiReviewError => {
  if (error instanceof AiReviewError) return error;
  const status = statusOf(error);
  const name = (error as { name?: string } | null)?.name ?? '';
  if (status === 401 || status === 403) return new AiReviewError('The AI provider rejected the server API key. Ask an administrator to check AI_API_KEY (or DASHSCOPE_API_KEY on a Qwen install).', 'AI_AUTH');
  if (status === 429) return new AiReviewError('The AI provider is rate limiting requests or the account has no quota left. Try again later.', 'AI_RATE_LIMIT');
  if (status === 400) return new AiReviewError('The AI provider refused the request (the pull request may be too large for the model). Try a model with a larger context.', 'AI_BAD_REQUEST');
  if (status !== undefined && status >= 500) return new AiReviewError('The AI provider is having problems. Try again in a few minutes.', 'AI_UNAVAILABLE');
  if (/timeout|abort/i.test(name)) return new AiReviewError('The AI provider took too long to answer. Try again.', 'AI_TIMEOUT');
  return new AiReviewError('The AI provider could not be reached. Try again later.', 'AI_UNREACHABLE');
};

interface Completion {
  content: string;
  /** `length` = the answer was cut off at the token limit. */
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
}

/** One chat call with up to MAX_HTTP_RETRIES retries on 429 and 5xx (backoff 2s, 6s). */
const complete = async (
  client: ChatClient,
  model: string,
  messages: ChatMessage[],
  started: number,
  options: Required<Pick<ProviderOptions, 'sleep' | 'now'>>,
  limits: CallLimits = REVIEW_LIMITS,
  budgetMs: number = TOTAL_BUDGET_MS,
): Promise<Completion> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: limits.maxTokens,
      }, { timeout: limits.timeoutMs, maxRetries: 0 });
      const content = response.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') throw new AiReviewError('The AI provider returned an empty answer. Try again.', 'AI_EMPTY');
      return {
        content,
        finishReason: response.choices?.[0]?.finish_reason ?? '',
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      const outOfTime = options.now() - started > budgetMs;
      if (!isRetryable(error) || attempt >= MAX_HTTP_RETRIES || outOfTime) throw describeProviderError(error);
      await options.sleep(attempt === 0 ? 2000 : 6000);
    }
  }
};

/**
 * Asks the model for the review and returns its validated answer (see schema.ts for the rules applied afterwards).
 * The answer is validated with zod; when it does not match, the model gets the validation error once and tries again.
 * Throws `AiReviewError` (safe message) when no valid answer could be obtained.
 */
export const reviewWithModel = async (input: ReviewModelInput, options: ProviderOptions = {}): Promise<ReviewModelResult> => {
  const config = readAiConfig();
  if (!config.available && !options.client) throw new AiReviewError('The AI code review is not configured on this server.', 'AI_DISABLED');

  const client = options.client ?? createClient();
  const runtime = { sleep: options.sleep ?? defaultSleep, now: options.now ?? Date.now };
  const started = runtime.now();
  const usage = { inputTokens: 0, outputTokens: 0 };

  const messages = buildMessages(input);
  let completion = await complete(client, config.model, messages, started, runtime);
  usage.inputTokens += completion.inputTokens;
  usage.outputTokens += completion.outputTokens;

  let parsed = parseModelOutput(completion.content);
  if (!parsed.ok) {
    completion = await complete(client, config.model, buildRepairMessages(messages, completion.content, parsed.problem), started, runtime);
    usage.inputTokens += completion.inputTokens;
    usage.outputTokens += completion.outputTokens;
    parsed = parseModelOutput(completion.content);
  }
  if (!parsed.ok) throw new AiReviewError('The AI provider did not return a usable review twice in a row. Try again.', 'AI_INVALID_OUTPUT');

  return { output: parsed.output, model: config.model, usage };
};

// ----------------------------------------------------------------
// Any JSON answer (used by the project plan generator)
// ----------------------------------------------------------------
export interface GenerateOptions extends ProviderOptions {
  maxTokens?: number;
  /** Time one request may take. */
  timeoutMs?: number;
  /** Time the whole call may take, retries included (the function limit minus a margin). */
  hardLimitMs?: number;
}

export interface GenerateResult<T> {
  output: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

const CUT_OFF_HINT = 'The answer was cut off because it was too long. Return a shorter complete JSON object: fewer items, shorter text, at most 3 acceptance criteria per item.';

/**
 * Asks the model for a JSON object and returns it validated and cleaned by `schema` (zod). When the answer does not
 * match, the model is told what was wrong and gets one more try, as long as the time budget allows.
 * Throws `AiReviewError` (safe message) when no valid answer could be obtained.
 */
export const generateJson = async <S extends z.ZodType>(
  schema: S,
  messages: ChatMessage[],
  options: GenerateOptions = {},
): Promise<GenerateResult<z.output<S>>> => {
  const config = readAiConfig();
  if (!config.available && !options.client) throw new AiReviewError('The AI features are not configured on this server.', 'AI_DISABLED');

  const client = options.client ?? createClient();
  const runtime = { sleep: options.sleep ?? defaultSleep, now: options.now ?? Date.now };
  const started = runtime.now();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const hardLimitMs = options.hardLimitMs ?? 285_000;
  const limits: CallLimits = { maxTokens: options.maxTokens ?? MAX_OUTPUT_TOKENS, timeoutMs };
  const usage = { inputTokens: 0, outputTokens: 0 };

  // A retry after a transport error may only start when a whole request still fits
  let completion = await complete(client, config.model, messages, started, runtime, limits, Math.max(0, hardLimitMs - timeoutMs));
  usage.inputTokens += completion.inputTokens;
  usage.outputTokens += completion.outputTokens;

  let parsed = parseJsonWith(schema, completion.content);
  if (!parsed.ok) {
    const remaining = hardLimitMs - (runtime.now() - started);
    if (remaining > 30_000) {
      const problem = completion.finishReason === 'length' ? CUT_OFF_HINT : parsed.problem;
      const repairLimits: CallLimits = { ...limits, timeoutMs: Math.min(timeoutMs, remaining - 5000) };
      completion = await complete(client, config.model, buildRepairMessages(messages, completion.content, problem), started, runtime, repairLimits, 0);
      usage.inputTokens += completion.inputTokens;
      usage.outputTokens += completion.outputTokens;
      parsed = parseJsonWith(schema, completion.content);
    }
  }
  if (!parsed.ok) throw new AiReviewError('The AI provider did not return a usable answer twice in a row. Try again, or use a shorter document.', 'AI_INVALID_OUTPUT');

  return { output: parsed.output, model: config.model, usage };
};
