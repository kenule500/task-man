// AI provider presets and the safe base-URL rules shared by the workspace BYOK settings,
// the code review and the document plan. Pure module: no network, database or logging.

export const AI_PROVIDER_IDS = ['qwen', 'deepseek', 'openai', 'opencode', 'custom'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];
/** `unknown` is only used when a stored provider names a value this version does not support. */
export type AiProviderViewId = AiProviderId | 'unknown';

export type AiConfigProblem =
  | 'AI_NOT_CONFIGURED'
  | 'PROVIDER_UNKNOWN'
  | 'KEY_MISSING'
  | 'KEY_UNREADABLE'
  | 'MODEL_MISSING'
  | 'BASE_URL_INVALID'
  | 'BASE_URL_PRIVATE'
  | 'BASE_URL_UNRESOLVED';

export interface AiProviderPreset {
  id: AiProviderId;
  label: string;
  baseURL: string;
  model: string;
  /** Every provider needs a key; a custom endpoint is not allowed to work without one either. */
  requiresKey: boolean;
}

export const AI_PROVIDER_PRESETS: Record<AiProviderId, AiProviderPreset> = {
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    requiresKey: true,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    requiresKey: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    requiresKey: true,
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode Console',
    baseURL: 'https://opencode.ai/inference/openai/v1',
    model: 'deepseek-v4.1-flash-free',
    requiresKey: true,
  },
  custom: {
    id: 'custom',
    label: 'Custom endpoint',
    baseURL: '',
    model: '',
    requiresKey: true,
  },
};

export const isAiProviderId = (value: string): value is AiProviderId =>
  (AI_PROVIDER_IDS as readonly string[]).includes(value);

/**
 * Normalises a base URL and rejects anything that could send a key somewhere unsafe.
 * Only HTTPS is accepted: no credentials, query or fragment, and no plain-HTTP loopback
 * exception. The DNS/IP checks live in `urlGuard.ts`.
 */
export const normalizeBaseURL = (value: string): string | null => {
  const raw = value.trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (!url.hostname) return null;
    return raw;
  } catch {
    return null;
  }
};
