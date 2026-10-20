// AI code review configuration, read from the environment on every call so it can change in tests.
// The provider presets live in ./providers.ts; the API key is never logged or returned by any route.

import {
  AI_PROVIDER_PRESETS,
  resolveAiProvider,
  type AiConfigProblem,
  type AiProviderViewId,
} from './providers.js';

export const DEFAULT_BASE_URL = AI_PROVIDER_PRESETS.qwen.baseURL;
// qwen-plus: long context for large diffs at a moderate price (override with AI_MODEL)
export const DEFAULT_MODEL = AI_PROVIDER_PRESETS.qwen.model;
export const DEFAULT_DAILY_LIMIT = 50;
export const DEFAULT_MAX_DIFF_CHARS = 120_000;

export interface AiConfig {
  /** The server resolved a usable provider (key and endpoint), so the feature can be switched on. */
  available: boolean;
  apiKey: string;
  baseURL: string;
  model: string;
  /** Provider selected for the whole installation (never its key). */
  provider: { id: AiProviderViewId; label: string };
  /** Why AI is unavailable, when the environment is wrong; null when it is usable. */
  problem: AiConfigProblem | null;
  /** Reviews a workspace may start per UTC day. */
  dailyLimit: number;
  /** Characters of diff sent to the model for one review. */
  maxDiffChars: number;
}

const positiveInt = (value: string | undefined, fallback: number, max: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

export const readAiConfig = (source: NodeJS.ProcessEnv = process.env): AiConfig => {
  const provider = resolveAiProvider(source);
  return {
    available: provider.available,
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    model: provider.model,
    provider: { id: provider.id, label: provider.label },
    problem: provider.problem,
    dailyLimit: positiveInt(source.AI_REVIEW_DAILY_LIMIT, DEFAULT_DAILY_LIMIT, 10_000),
    maxDiffChars: positiveInt(source.AI_REVIEW_MAX_DIFF_CHARS, DEFAULT_MAX_DIFF_CHARS, 400_000),
  };
};
