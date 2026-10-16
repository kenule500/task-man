// AI code review configuration, read from the environment on every call so it can change in tests.
// The API key is never logged or returned by any route.

export const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
// qwen-plus: long context for large diffs at a moderate price (override with DASHSCOPE_MODEL)
export const DEFAULT_MODEL = 'qwen-plus';
export const DEFAULT_DAILY_LIMIT = 50;
export const DEFAULT_MAX_DIFF_CHARS = 120_000;

export interface AiConfig {
  /** The server has an API key, so the feature can be switched on by workspaces. */
  available: boolean;
  apiKey: string;
  baseURL: string;
  model: string;
  /** Reviews a workspace may start per UTC day. */
  dailyLimit: number;
  /** Characters of diff sent to the model for one review. */
  maxDiffChars: number;
}

const positiveInt = (value: string | undefined, fallback: number, max: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

/** Only an https URL is accepted, so the key is never sent over plain HTTP. */
const httpsUrl = (value: string | undefined, fallback: string): string => {
  const raw = value?.trim().replace(/\/+$/, '');
  if (!raw) return fallback;
  try {
    return new URL(raw).protocol === 'https:' ? raw : fallback;
  } catch {
    return fallback;
  }
};

export const readAiConfig = (source: NodeJS.ProcessEnv = process.env): AiConfig => {
  const apiKey = source.DASHSCOPE_API_KEY?.trim() ?? '';
  return {
    available: apiKey.length > 0,
    apiKey,
    baseURL: httpsUrl(source.DASHSCOPE_BASE_URL, DEFAULT_BASE_URL),
    model: source.DASHSCOPE_MODEL?.trim() || DEFAULT_MODEL,
    dailyLimit: positiveInt(source.AI_REVIEW_DAILY_LIMIT, DEFAULT_DAILY_LIMIT, 10_000),
    maxDiffChars: positiveInt(source.AI_REVIEW_MAX_DIFF_CHARS, DEFAULT_MAX_DIFF_CHARS, 400_000),
  };
};
