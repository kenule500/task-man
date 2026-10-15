import { useEffect, useState } from 'react';
import { ssoApi } from '../api';
import type { SsoProvider } from '../types';

/** Providers the server has configured. Sign-in with a password never waits on this: failures mean "none". */
export const useSsoProviders = (): SsoProvider[] => {
  const [providers, setProviders] = useState<SsoProvider[]>([]);

  useEffect(() => {
    let cancelled = false;
    ssoApi.providers()
      .then((list) => { if (!cancelled) setProviders(list); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return providers;
};
