// Settings of "create a project from a document", read from the environment on every call (so tests can change them).
// The provider, key and model are the ones of the AI code review (see ../config.ts).

export const DEFAULT_PLAN_DAILY_LIMIT = 20;
export const DEFAULT_PLAN_MAX_CHARS = 60_000;
export const DEFAULT_PLAN_MAX_MB = 4;
/** Output budget for one plan. qwen-plus accepts up to 8192 in every mode; raise it for models that allow more. */
export const DEFAULT_PLAN_MAX_OUTPUT_TOKENS = 8192;
/** One generation may take this long before it is given up (the function limit is 300 s). */
export const DEFAULT_PLAN_TIMEOUT_SECONDS = 200;

export interface PlanConfig {
  /** Plan generations a workspace may start per UTC day (separate from the code review limit). */
  dailyLimit: number;
  /** Characters of the document sent to the model; the rest is left out and the plan is marked partial. */
  maxChars: number;
  /** Largest upload in bytes. Vercel itself refuses request bodies above 4.5 MB. */
  maxBytes: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

const positiveInt = (value: string | undefined, fallback: number, max: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

export const readPlanConfig = (source: NodeJS.ProcessEnv = process.env): PlanConfig => ({
  dailyLimit: positiveInt(source.AI_PLAN_DAILY_LIMIT, DEFAULT_PLAN_DAILY_LIMIT, 10_000),
  maxChars: positiveInt(source.AI_PLAN_MAX_CHARS, DEFAULT_PLAN_MAX_CHARS, 400_000),
  maxBytes: positiveInt(source.AI_PLAN_MAX_MB, DEFAULT_PLAN_MAX_MB, 25) * 1024 * 1024,
  maxOutputTokens: positiveInt(source.AI_PLAN_MAX_OUTPUT_TOKENS, DEFAULT_PLAN_MAX_OUTPUT_TOKENS, 65_536),
  timeoutMs: positiveInt(source.AI_PLAN_TIMEOUT_SECONDS, DEFAULT_PLAN_TIMEOUT_SECONDS, 280) * 1000,
});

// ----------------------------------------------------------------
// Document analyzer (services/document-analyzer)
// ----------------------------------------------------------------
export type DocumentAnalyzerMode = 'documind' | 'ai';

export interface AnalyzerConfig {
  mode: DocumentAnalyzerMode;
  /** Base URL, without a trailing slash. */
  url: string;
  token: string;
  /** True when documind mode has a usable HTTPS (or development loopback) URL and a 32+ byte token. */
  configured: boolean;
  timeoutMs: number;
  /** Allow the v1 provider path on infrastructure failures only. */
  fallback: boolean;
  /** Characters of text sent to the analyzer; Node truncates first. */
  maxChars: number;
  maxBytes: number;
}

export const DEFAULT_ANALYZER_MAX_CHARS = 24_000;
export const DEFAULT_ANALYZER_MAX_MB = 2;

const boolean = (value: string | undefined): boolean => value === 'true' || value === '1';

/** https everywhere; http only for loopback in development. */
export const isAnalyzerUrlAllowed = (value: string, environment = process.env.NODE_ENV ?? 'development'): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return loopback && environment !== 'production';
  } catch {
    return false;
  }
};

export const readAnalyzerConfig = (source: NodeJS.ProcessEnv = process.env): AnalyzerConfig => {
  const plan = readPlanConfig(source);
  const mode: DocumentAnalyzerMode = source.DOCUMENT_ANALYZER_MODE === 'documind' ? 'documind' : 'ai';
  const url = (source.DOCUMENT_ANALYZER_URL ?? '').trim().replace(/\/+$/, '');
  const token = (source.DOCUMENT_ANALYZER_TOKEN ?? '').trim();
  const timeout = positiveInt(source.DOCUMENT_ANALYZER_TIMEOUT_SECONDS, DEFAULT_PLAN_TIMEOUT_SECONDS, 280) * 1000;
  return {
    mode,
    url,
    token,
    configured: mode === 'documind' && isAnalyzerUrlAllowed(url, source.NODE_ENV ?? 'development') && token.length >= 32,
    timeoutMs: Math.min(timeout, plan.timeoutMs),
    fallback: boolean(source.DOCUMENT_ANALYZER_FALLBACK),
    maxChars: positiveInt(source.DOCUMENT_ANALYZER_MAX_CHARS, DEFAULT_ANALYZER_MAX_CHARS, 200_000),
    maxBytes: positiveInt(source.DOCUMENT_ANALYZER_MAX_MB, DEFAULT_ANALYZER_MAX_MB, 10) * 1024 * 1024,
  };
};
