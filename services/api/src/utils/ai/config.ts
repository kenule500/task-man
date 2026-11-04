// Installation limits for the AI features. Provider credentials come from each workspace's
// encrypted BYOK configuration (see ./workspaceConfig.ts); nothing here reads a provider key.

import { AI_PROVIDER_PRESETS, type AiConfigProblem, type AiProviderViewId } from './providers.js';

export const DEFAULT_BASE_URL = AI_PROVIDER_PRESETS.qwen.baseURL;
export const DEFAULT_MODEL = AI_PROVIDER_PRESETS.qwen.model;
export const DEFAULT_DAILY_LIMIT = 50;
export const DEFAULT_MAX_DIFF_CHARS = 120_000;

export interface AiLimits {
  /** Reviews a workspace may start per UTC day. */
  dailyLimit: number;
  /** Characters of diff sent to the model for one review. */
  maxDiffChars: number;
}

/** Kept for older callers and type compatibility; it never supplies a usable provider. */
export interface AiConfig extends AiLimits {
  available: boolean;
  apiKey: string;
  baseURL: string;
  model: string;
  provider: { id: AiProviderViewId; label: string };
  problem: AiConfigProblem | null;
}

const positiveInt = (value: string | undefined, fallback: number, max: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

export const readAiLimits = (source: NodeJS.ProcessEnv = process.env): AiLimits => ({
  dailyLimit: positiveInt(source.AI_REVIEW_DAILY_LIMIT, DEFAULT_DAILY_LIMIT, 10_000),
  maxDiffChars: positiveInt(source.AI_REVIEW_MAX_DIFF_CHARS, DEFAULT_MAX_DIFF_CHARS, 400_000),
});

/**
 * Compatibility shim for callers written before workspace BYOK. It exposes the daily limits only:
 * no provider, key, endpoint or model is read from the environment any more. New code must use
 * `resolveWorkspaceAiConfig`.
 */
export const readAiConfig = (source: NodeJS.ProcessEnv = process.env): AiConfig => ({
  available: false,
  apiKey: '',
  baseURL: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  provider: { id: 'unknown', label: 'Not configured' },
  problem: 'AI_NOT_CONFIGURED',
  ...readAiLimits(source),
});
