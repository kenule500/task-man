import { randomUUID } from 'node:crypto';
import { Agent } from 'undici';
import { AiReviewError } from '../types.js';
import type { AnalyzerConfig } from './config.js';
import { modelPlanSchema, type PlanContent, type PlanLanguage } from './schema.js';

// The only place that talks to services/document-analyzer. The service is private and the
// contract is the same one the Python Pydantic models validate.

/**
 * Node's fetch gives up when a response's header block has not arrived after 300 s, whatever
 * AbortSignal says. A DocuMind plan may legitimately use the whole configured budget (600 s on a
 * slow provider), so the call runs on a dispatcher that waits for the budget plus one margin.
 * Built on first use: a test that injects its own fetch never creates one, and no timer is left
 * behind in a process that never talks to the service.
 */
let sharedDispatcher: Agent | null = null;
const analyzerDispatcher = (): Agent => {
  sharedDispatcher ??= new Agent({
    headersTimeout: 660_000,
    bodyTimeout: 660_000,
    connectTimeout: 10_000,
  });
  return sharedDispatcher;
};

export interface AnalyzePlanOptions {
  projectName: string;
  projectKey: string;
  sprintLengthWeeks: number;
  startDate: string;
  teamSize: number | null;
  extraInstructions: string;
  language: PlanLanguage;
  /** A target project means the plan is added to an existing project. */
  targetProjectId: string | null;
}

export interface AnalyzePlanInput {
  fileName: string;
  mimeType: string;
  text: string;
  options: AnalyzePlanOptions;
  /**
   * The workspace's provider, so the pipeline runs on that workspace's account. It is the only
   * provider there is: the analyzer stores no credentials of its own and refuses a request without
   * this block, so it is required here too -- there is nothing to fall back to.
   */
  llm: WorkspaceLlm;
}

/** The BYOK block the analyzer needs to build its engine: an OpenAI-compatible endpoint. */
export interface WorkspaceLlm {
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface AnalyzePlanResult {
  plan: PlanContent;
  model: string;
  latencyMs: number;
}

const INFRASTRUCTURE_CODES = new Set(['ANALYZER_UNAVAILABLE', 'ANALYZER_TIMEOUT', 'ANALYZER_RATE_LIMITED']);
/** True for the failures the configured fallback may cover. */
export const isInfrastructureFailure = (code: string): boolean => INFRASTRUCTURE_CODES.has(code);

const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;
let breakerFailures = 0;
let breakerOpenUntil = 0;

const breakerIsOpen = (): boolean => Date.now() < breakerOpenUntil;
const recordInfrastructureFailure = (): void => {
  breakerFailures += 1;
  if (breakerFailures >= BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    breakerFailures = 0;
  }
};
const recordSuccess = (): void => {
  breakerFailures = 0;
  breakerOpenUntil = 0;
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const isAbort = (error: unknown): boolean =>
  (error as { name?: string } | null)?.name === 'AbortError' || (error as { name?: string } | null)?.name === 'TimeoutError';

/**
 * Only a failure that happened before the request was sent may be retried.
 *
 * Retrying after the body left the socket is not safe on a streamed body (the service may have
 * begun the work and written the same analysis again under the same request id). The service
 * caches a finished answer by request id, so a retry would be cheap, but a failure it never
 * answers -- a dropped connection -- is not covered by that cache. The connect failures below
 * are the ones Node reports while dialling, before any bytes are written.
 */
const CONNECT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);
const isConnectFailure = (error: unknown): boolean => {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const code = (error as { code?: unknown } | null)?.code;
  return [cause?.code, code].some(value => typeof value === 'string' && CONNECT_CODES.has(value));
};

const failure = (message: string, code: string): AiReviewError => new AiReviewError(message, code);

/** The service's own refusal: { requestId, code, message } with a stable ANALYZER_* code. */
const readServiceError = async (response: Response): Promise<{ code: string; message: string } | null> => {
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown } | null;
    const code = typeof body?.code === 'string' && /^ANALYZER_[A-Z_]{2,40}$/.test(body.code) ? body.code : '';
    const message = typeof body?.message === 'string' ? body.message.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
    return code || message ? { code, message } : null;
  } catch {
    return null;
  }
};

/** Posts one analysis request and returns the validated, still unfinalised plan. */
export const analyzePlan = async (
  input: AnalyzePlanInput,
  config: AnalyzerConfig,
  fetchImpl: typeof fetch = fetch,
  /** Reuse the id of an earlier attempt, so a retried request is answered from the service's cache. */
  requestId: string = randomUUID(),
): Promise<AnalyzePlanResult> => {
  if (!config.configured) {
    throw failure(
      'The document analyzer is not configured. An operator must set DOCUMENT_ANALYZER_URL and DOCUMENT_ANALYZER_TOKEN.',
      'ANALYZER_NOT_CONFIGURED',
    );
  }
  if (breakerIsOpen()) {
    throw failure('The document analyzer is temporarily unavailable. Try again shortly.', 'ANALYZER_UNAVAILABLE');
  }

  const body = JSON.stringify({
    contractVersion: 1,
    requestId,
    document: { fileName: input.fileName, mimeType: input.mimeType, text: input.text },
    options: {
      projectName: input.options.projectName,
      projectKey: input.options.projectKey,
      sprintLengthWeeks: input.options.sprintLengthWeeks,
      startDate: input.options.startDate,
      teamSize: input.options.teamSize,
      extraInstructions: input.options.extraInstructions,
      language: input.options.language,
      existingProject: Boolean(input.options.targetProjectId),
    },
    // The workspace's own endpoint, model and key: the plan is billed to whoever asked for it.
    // Always sent: the analyzer holds no provider credentials of its own and refuses a request
    // without this block, so there is no deployment-wide provider to fall back to.
    llm: { model: input.llm.model, apiKey: input.llm.apiKey, baseUrl: input.llm.baseUrl },
  });

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(`${config.url}/v1/plans:analyze`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.token}`,
          // The same id on every attempt of this plan: the service caches by it, so a resend
          // of a request it already answered never runs the generation twice.
          'x-request-id': requestId,
        },
        body,
        signal: AbortSignal.timeout(config.timeoutMs),
        // Wait for the service's whole budget instead of undici's 300 s default.
        dispatcher: analyzerDispatcher(),
      } as RequestInit & { dispatcher: unknown });
    } catch (error) {
      if (isAbort(error)) {
        recordInfrastructureFailure();
        throw failure('The document analyzer took too long. Try again or use a shorter document.', 'ANALYZER_TIMEOUT');
      }
      if (attempt === 1 && isConnectFailure(error)) {
        // Nothing was sent yet, so one more try cannot run DocuMind twice
        await sleep(250);
        continue;
      }
      recordInfrastructureFailure();
      throw failure('The document analyzer could not be reached. Try again shortly.', 'ANALYZER_UNAVAILABLE');
    }

    if (response.status === 429) {
      // The concurrency limiter refused it before any work: sending it again would be a second
      // request for the same plan, so the person retries instead.
      const problem = await readServiceError(response);
      recordInfrastructureFailure();
      throw failure(problem?.message || 'The document analyzer is busy. Try again in a few minutes.', 'ANALYZER_RATE_LIMITED');
    }
    if (response.status === 401 || response.status === 403) {
      throw failure('The document analyzer refused the service token. An operator must check DOCUMENT_ANALYZER_TOKEN.', 'ANALYZER_UNAUTHORIZED');
    }
    if (!response.ok) {
      // Keep the service's own code and sentence: a body that is too large, an answer that
      // was cut off and a plan that breaks the contract are different failures, and each
      // leads to a different fix.
      const problem = await readServiceError(response);
      if (response.status >= 500) {
        recordInfrastructureFailure();
        const code = problem && isInfrastructureFailure(problem.code) ? problem.code : 'ANALYZER_UNAVAILABLE';
        throw failure(problem?.message || 'The document analyzer failed. Try again shortly.', code);
      }
      if (response.status === 413) {
        throw failure(
          problem?.message || 'The document is too large for the document analyzer.',
          'ANALYZER_BODY_TOO_LARGE',
        );
      }
      throw failure(
        problem?.message || 'The document analyzer refused the request or returned an unusable plan.',
        problem?.code || 'ANALYZER_INVALID_OUTPUT',
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw failure('The document analyzer returned an unreadable answer.', 'ANALYZER_INVALID_OUTPUT');
    }

    const envelope = payload as { contractVersion?: unknown; plan?: unknown; analyzer?: { model?: unknown; latencyMs?: unknown } } | null;
    if (!envelope || envelope.contractVersion !== 1) {
      throw failure('The document analyzer returned an unknown contract version.', 'ANALYZER_INVALID_OUTPUT');
    }
    const parsed = modelPlanSchema.safeParse(envelope.plan);
    if (!parsed.success) {
      throw failure('The document analyzer did not return a usable plan.', 'ANALYZER_INVALID_OUTPUT');
    }

    recordSuccess();
    return {
      plan: parsed.data,
      model: typeof envelope.analyzer?.model === 'string' ? envelope.analyzer.model : '',
      latencyMs: typeof envelope.analyzer?.latencyMs === 'number' ? envelope.analyzer.latencyMs : 0,
    };
  }

  recordInfrastructureFailure();
  throw failure('The document analyzer could not be reached. Try again shortly.', 'ANALYZER_UNAVAILABLE');
};
