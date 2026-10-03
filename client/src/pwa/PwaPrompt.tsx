import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

const OFFLINE_READY_HIDE_MS = 4000;

/** Fixed bottom toast for service worker lifecycle: update available / ready offline. */
export default function PwaPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(() => setOfflineReady(false), OFFLINE_READY_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 pb-[env(safe-area-inset-bottom)] sm:left-auto sm:right-4 sm:w-96">
      <div
        role="status"
        className="pointer-events-auto rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-lg"
      >
        {needRefresh ? (
          <>
            <p className="font-medium text-slate-900">New version available</p>
            <p className="mt-0.5 text-slate-500">Reload to get the latest TaskMan.</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
                Later
              </Button>
              <Button onClick={() => void updateServiceWorker(true)}>Reload</Button>
            </div>
          </>
        ) : (
          <p className="font-medium text-slate-900">Ready to work offline</p>
        )}
      </div>
    </div>
  );
}
