import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { tokensApi } from '../api';
import type { ApiToken, ApiTokenInput, CreatedApiToken } from '../types';

/** The signed-in person's API tokens in a workspace. Mutations reject with a readable message. */
export const useTokens = (slug: string | undefined) => {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [error, setError] = useState('');
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = slug ? `${slug}:${attempt}` : null;
  const loading = key !== null && loadedKey !== key;

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const currentKey = `${slug}:${attempt}`;
    tokensApi.list(slug)
      .then(list => {
        if (cancelled) return;
        setTokens(list);
        setError('');
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'We could not load your API tokens.'));
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(currentKey);
      });
    return () => { cancelled = true; };
  }, [slug, attempt]);

  const reload = useCallback(() => {
    setError('');
    setAttempt(current => current + 1);
  }, []);

  const createToken = useCallback(async (input: ApiTokenInput): Promise<CreatedApiToken> => {
    if (!slug) throw new Error('No workspace selected');
    try {
      const created = await tokensApi.create(slug, input);
      // The plain token is only in the returned value; the list keeps the public fields
      const { token: _secret, ...publicFields } = created;
      void _secret;
      setTokens(current => [publicFields, ...current]);
      return created;
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'We could not create the token.'), { cause: err });
    }
  }, [slug]);

  const revokeToken = useCallback(async (id: string): Promise<void> => {
    if (!slug) throw new Error('No workspace selected');
    try {
      await tokensApi.revoke(slug, id);
      setTokens(current => current.filter(token => token._id !== id));
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'We could not revoke the token.'), { cause: err });
    }
  }, [slug]);

  return { tokens, loading, error, reload, createToken, revokeToken };
};
