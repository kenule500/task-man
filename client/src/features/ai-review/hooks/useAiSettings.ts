import { useCallback, useEffect, useState } from 'react';
import i18n from '@/i18n';
import { getApiErrorMessage } from '@/utils/api';
import { aiReviewApi } from '../api';
import type { AiProviderInput, AiProviderTestResult, AiSettings, AiSettingsPatch } from '../types';

/** AI code review settings of a workspace (readable with tasks:read; `update` needs settings:manage). */
export const useAiSettings = (slug: string | undefined) => {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    aiReviewApi.getSettings(slug)
      .then(data => {
        if (cancelled) return;
        setSettings(data);
        setError('');
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, i18n.t('ai:settings.loadError')));
      });
    return () => { cancelled = true; };
  }, [slug, attempt]);

  const reload = useCallback(() => {
    setError('');
    setAttempt(current => current + 1);
  }, []);

  /** Saves and shows the server's answer; rejects with a readable message. */
  const update = useCallback(async (patch: AiSettingsPatch): Promise<AiSettings> => {
    if (!slug) throw new Error('No workspace selected');
    try {
      const saved = await aiReviewApi.updateSettings(slug, patch);
      setSettings(saved);
      return saved;
    } catch (err) {
      throw new Error(getApiErrorMessage(err, i18n.t('ai:settings.saveError')), { cause: err });
    }
  }, [slug]);

  /** Saves the workspace provider; the key is write-only and never returned. */
  const saveProvider = useCallback(async (input: AiProviderInput): Promise<AiSettings> => {
    if (!slug) throw new Error('No workspace selected');
    try {
      const saved = await aiReviewApi.saveProvider(slug, input);
      setSettings(saved);
      return saved;
    } catch (err) {
      throw new Error(getApiErrorMessage(err, i18n.t('ai:settings.provider.saveError')), { cause: err });
    }
  }, [slug]);

  const removeProvider = useCallback(async (): Promise<AiSettings> => {
    if (!slug) throw new Error('No workspace selected');
    try {
      const saved = await aiReviewApi.removeProvider(slug);
      setSettings(saved);
      return saved;
    } catch (err) {
      throw new Error(getApiErrorMessage(err, i18n.t('ai:settings.provider.saveError')), { cause: err });
    }
  }, [slug]);

  const testProvider = useCallback(async (input?: AiProviderInput): Promise<AiProviderTestResult> => {
    if (!slug) throw new Error('No workspace selected');
    try {
      const result = await aiReviewApi.testProvider(slug, input);
      // A saved-configuration test records the time and result on the server; refresh so the card shows it.
      reload();
      return result;
    } catch (err) {
      throw new Error(getApiErrorMessage(err, i18n.t('ai:settings.provider.testError')), { cause: err });
    }
  }, [slug, reload]);

  return {
    settings, loading: Boolean(slug) && !settings && !error, error, reload, update, saveProvider, removeProvider, testProvider,
  };
};
