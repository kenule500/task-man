// Installation-level AI provider presets, resolved from the environment on every call.
// Pure module: no network, no database and no logging, so the AI review and the document
// plan features always resolve the same provider. The key is never returned by a route.

export const AI_PROVIDER_IDS = ['qwen', 'deepseek', 'openai', 'openrouter', 'custom'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];
/** `unknown` is only used when AI_PROVIDER names a value this version does not support. */
export type AiProviderViewId = AiProviderId | 'unknown';

export type AiConfigProblem = 'PROVIDER_UNKNOWN' | 'KEY_MISSING' | 'MODEL_MISSING' | 'BASE_URL_INVALID';

export interface AiProviderPreset {
  id: AiProviderId;
  label: string;
  baseURL: string;
  model: string;
  /** Hosted providers need a key; a custom endpoint may be a local server without one. */
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
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4',
    requiresKey: true,
  },
  custom: {
    id: 'custom',
    label: 'Custom endpoint',
    baseURL: '',
    model: '',
    requiresKey: false,
  },
};

export interface ResolvedAiProvider {
  /** Never the raw unsupported value: it is not echoed back to clients or logs. */
  id: AiProviderViewId;
  label: string;
  available: boolean;
  apiKey: string;
  baseURL: string;
  model: string;
  problem: AiConfigProblem | null;
}

const text = (value: string | undefined): string => value?.trim() ?? '';

const isProviderId = (value: string): value is AiProviderId =>
  (AI_PROVIDER_IDS as readonly string[]).includes(value);

const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';

/**
 * Normalises a base URL and rejects anything that would send the key somewhere unsafe:
 * only HTTPS, with a loopback-only HTTP exception for a custom local server. Credentials
 * embedded in the URL are refused so they cannot be logged or returned by accident.
 */
export const normalizeBaseURL = (value: string, custom: boolean): string | null => {
  const raw = value.trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    if (url.protocol === 'https:') return raw;
    if (custom && url.protocol === 'http:' && isLoopback(url.hostname)) return raw;
    return null;
  } catch {
    return null;
  }
};

/**
 * Resolves `AI_PROVIDER` (or the legacy `DASHSCOPE_*` Qwen alias) into one configuration.
 * `AI_*` always wins when both families are set. Invalid configuration never throws: the
 * result is marked unavailable with a safe problem code, so the API keeps running.
 */
export const resolveAiProvider = (source: NodeJS.ProcessEnv = process.env): ResolvedAiProvider => {
  const requested = text(source.AI_PROVIDER).toLowerCase() || 'qwen';
  if (!isProviderId(requested)) {
    return {
      id: 'unknown',
      label: 'Unknown provider',
      available: false,
      apiKey: '',
      baseURL: '',
      model: '',
      problem: 'PROVIDER_UNKNOWN',
    };
  }

  const preset = AI_PROVIDER_PRESETS[requested];
  const legacyQwen = requested === 'qwen';
  const apiKey = text(source.AI_API_KEY) || (legacyQwen ? text(source.DASHSCOPE_API_KEY) : '');
  const baseInput =
    text(source.AI_BASE_URL) || (legacyQwen ? text(source.DASHSCOPE_BASE_URL) : '') || preset.baseURL;
  const model = text(source.AI_MODEL) || (legacyQwen ? text(source.DASHSCOPE_MODEL) : '') || preset.model;
  const baseURL = normalizeBaseURL(baseInput, requested === 'custom');

  let problem: AiConfigProblem | null = null;
  if (!baseURL) problem = 'BASE_URL_INVALID';
  else if (!model) problem = 'MODEL_MISSING';
  else if (preset.requiresKey && !apiKey) problem = 'KEY_MISSING';

  return {
    id: preset.id,
    label: preset.label,
    available: problem === null,
    apiKey,
    // Keep the documented default for display when a hosted URL is invalid; `available`
    // is false, so the value is never used for a request.
    baseURL: baseURL ?? preset.baseURL,
    model,
    problem,
  };
};
