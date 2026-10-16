import { useCallback, useEffect, useState } from 'react';
import i18n from '@/i18n';
import { getApiErrorMessage } from '@/utils/api';
import { aiReviewApi } from '../api';
import type { AiSettings, AiSettingsPatch } from '../types';

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

  return { settings, loading: Boolean(slug) && !settings && !error, error, reload, update };
};
