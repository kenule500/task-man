// Jest stand-in for `virtual:pwa-register/react` (a Vite virtual module).
import { useState } from 'react';

type StateTuple = [boolean, (value: boolean) => void];

// Tests flip these before rendering to simulate the service worker lifecycle.
export const pwaState = { needRefresh: false, offlineReady: false };
export const updateServiceWorker = jest.fn(async (reloadPage?: boolean) => void reloadPage);

export function useRegisterSW() {
  const [needRefresh, setNeedRefresh] = useState(pwaState.needRefresh);
  const [offlineReady, setOfflineReady] = useState(pwaState.offlineReady);
  return {
    needRefresh: [needRefresh, setNeedRefresh] as StateTuple,
    offlineReady: [offlineReady, setOfflineReady] as StateTuple,
    updateServiceWorker,
  };
}
