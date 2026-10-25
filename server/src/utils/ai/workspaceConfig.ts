import { decryptSecret } from '../secretBox.js';
import { readAiLimits, type AiLimits } from './config.js';
import {
  AI_PROVIDER_PRESETS,
  isAiProviderId,
  normalizeBaseURL,
  type AiConfigProblem,
  type AiProviderViewId,
} from './providers.js';

// Resolves the workspace's BYOK configuration into a usable provider, or a safe problem code.
// The key is decrypted here and returned only to the server-side model client; it is never logged.

export interface WorkspaceAiSettings {
  enabled?: boolean;
  autoReview?: boolean;
  provider?: string;
  /** Only used by the custom provider; presets supply their own endpoint. */
  baseURL?: string;
  model?: string;
  /** AES-256-GCM ciphertext bound to the workspace id. Never selected unless requested. */
  apiKeyEncrypted?: string;
  /** Last four characters of the key, for display only. */
  keyHint?: string;
  configuredAt?: Date;
  configuredBy?: unknown;
  lastTestedAt?: Date;
  lastTestStatus?: 'success' | 'failed';
  lastTestCode?: string;
}

export interface WorkspaceAiConfig {
  /** True only when a provider, a safe HTTPS endpoint, a model and a readable key are all present. */
  available: boolean;
  provider: { id: AiProviderViewId; label: string } | null;
  model: string;
  baseURL: string;
  /** Decrypted key. Empty when the configuration is not usable. */
  apiKey: string;
  keySet: boolean;
  keyHint: string | null;
  problem: AiConfigProblem | null;
  limits: AiLimits;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const keyHintOf = (value: unknown): string | null => {
  const hint = text(value);
  return hint ? hint.slice(-4) : null;
};

/**
 * The single place that turns stored workspace settings into a provider. Presets ignore any stored
 * endpoint so an admin cannot silently redirect a preset's key; `custom` uses the saved HTTPS URL.
 */
export const resolveWorkspaceAiConfig = (
  workspaceId: string,
  settings: WorkspaceAiSettings | null | undefined,
  source: NodeJS.ProcessEnv = process.env,
): WorkspaceAiConfig => {
  const limits = readAiLimits(source);
  const keySet = Boolean(settings?.apiKeyEncrypted);
  const keyHint = keyHintOf(settings?.keyHint);
  const requested = text(settings?.provider);

  if (!requested) {
    return {
      available: false, provider: null, model: '', baseURL: '', apiKey: '', keySet, keyHint, problem: 'AI_NOT_CONFIGURED', limits,
    };
  }
  if (!isAiProviderId(requested)) {
    return {
      available: false,
      provider: { id: 'unknown', label: 'Unknown provider' },
      model: '',
      baseURL: '',
      apiKey: '',
      keySet,
      keyHint,
      problem: 'PROVIDER_UNKNOWN',
      limits,
    };
  }

  const preset = AI_PROVIDER_PRESETS[requested];
  const storedBase = text(settings?.baseURL);
  const baseInput = requested === 'custom' ? storedBase : preset.baseURL;
  const baseURL = normalizeBaseURL(baseInput) ?? (requested === 'custom' ? storedBase : preset.baseURL);
  const model = text(settings?.model) || preset.model;

  if (!normalizeBaseURL(baseInput)) {
    return {
      available: false,
      provider: { id: preset.id, label: preset.label },
      model,
      baseURL,
      apiKey: '',
      keySet,
      keyHint,
      problem: 'BASE_URL_INVALID',
      limits,
    };
  }
  if (!model) {
    return {
      available: false,
      provider: { id: preset.id, label: preset.label },
      model: '',
      baseURL,
      apiKey: '',
      keySet,
      keyHint,
      problem: 'MODEL_MISSING',
      limits,
    };
  }

  let apiKey = '';
  if (settings?.apiKeyEncrypted) {
    try {
      apiKey = decryptSecret(settings.apiKeyEncrypted, workspaceId).trim();
    } catch {
      return {
        available: false,
        provider: { id: preset.id, label: preset.label },
        model,
        baseURL,
        apiKey: '',
        keySet,
        keyHint,
        problem: 'KEY_UNREADABLE',
        limits,
      };
    }
  }
  if (preset.requiresKey && !apiKey) {
    return {
      available: false,
      provider: { id: preset.id, label: preset.label },
      model,
      baseURL,
      apiKey: '',
      keySet,
      keyHint,
      problem: 'KEY_MISSING',
      limits,
    };
  }

  return {
    available: true,
    provider: { id: preset.id, label: preset.label },
    model,
    baseURL,
    apiKey,
    keySet,
    keyHint,
    problem: null,
    limits,
  };
};
