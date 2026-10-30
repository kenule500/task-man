import { randomUUID } from 'node:crypto';
import { AiReviewError } from '../types.js';
import type { AnalyzerConfig } from './config.js';
import { modelPlanSchema, type PlanContent, type PlanLanguage } from './schema.js';

// The only place that talks to services/document-analyzer. The service is private and the
// contract is the same one the Python Pydantic models validate.

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

/** Seconds the service asked us to wait, clamped to something a plan budget can absorb. */
const retryAfterSeconds = (response: Response): number => {
  const raw = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
  return Number.isInteger(raw) && raw > 0 ? Math.min(raw, 10) : 5;
};

const failure = (message: string, code: string): AiReviewError => new AiReviewError(message, code);

/** Posts one analysis request and returns the validated, still unfinalised plan. */
export const analyzePlan = async (
  input: AnalyzePlanInput,
  config: AnalyzerConfig,
  fetchImpl: typeof fetch = fetch,
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

  const requestId = randomUUID();
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
  });

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(`${config.url}/v1/plans:analyze`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.token}`,
          'x-request-id': requestId,
        },
        body,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      if (isAbort(error)) {
        recordInfrastructureFailure();
        throw failure('The document analyzer took too long. Try again or use a shorter document.', 'ANALYZER_TIMEOUT');
      }
      if (attempt === 1) {
        await sleep(250);
        continue;
      }
      recordInfrastructureFailure();
      throw failure('The document analyzer could not be reached. Try again shortly.', 'ANALYZER_UNAVAILABLE');
    }

    if (response.status === 429) {
      if (attempt === 1) {
        await sleep(retryAfterSeconds(response) * 1000);
        continue;
      }
      recordInfrastructureFailure();
      throw failure('The document analyzer is busy. Try again in a few minutes.', 'ANALYZER_RATE_LIMITED');
    }
    if (response.status === 401 || response.status === 403) {
      throw failure('The document analyzer refused the service token. An operator must check DOCUMENT_ANALYZER_TOKEN.', 'ANALYZER_UNAUTHORIZED');
    }
    if (!response.ok) {
      if (response.status >= 500) {
        recordInfrastructureFailure();
        throw failure('The document analyzer failed. Try again shortly.', 'ANALYZER_UNAVAILABLE');
      }
      throw failure('The document analyzer refused the request or returned an unusable plan.', 'ANALYZER_INVALID_OUTPUT');
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

