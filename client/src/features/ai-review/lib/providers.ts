import type { AiProviderChoice } from '../types';

// Display defaults for the provider form. The server preset is authoritative; these values let the
// form show the endpoint and model before anything is saved.

export interface ProviderPresetView {
  id: AiProviderChoice;
  baseURL: string;
  model: string;
}

export const PROVIDER_PRESETS: Record<AiProviderChoice, ProviderPresetView> = {
  qwen: { id: 'qwen', baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  deepseek: { id: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { id: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  opencode: { id: 'opencode', baseURL: 'https://opencode.ai/inference/openai/v1', model: 'deepseek-v4.1-flash-free' },
  custom: { id: 'custom', baseURL: '', model: '' },
};

export const PROVIDER_OPTIONS = (Object.keys(PROVIDER_PRESETS) as AiProviderChoice[])
  .map(id => ({ value: id, labelKey: `settings.provider.presets.${id}` }));

/** The default model for a provider; custom has none, so the field starts empty. */
export const defaultModelOf = (provider: AiProviderChoice): string => PROVIDER_PRESETS[provider].model;
