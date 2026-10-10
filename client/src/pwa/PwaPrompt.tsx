import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Banner } from '@/components/ds';
import { Button } from '@/components/ui/button';

const OFFLINE_READY_HIDE_MS = 4000;

/** Service worker lifecycle: an info Banner when an update is available, a small toast when ready offline. */
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

  if (needRefresh) {
    return (
      <Banner
        tone="info"
        rounded={false}
        title="New version available"
        action={<Button size="sm" onClick={() => void updateServiceWorker(true)}>Reload</Button>}
        onDismiss={() => setNeedRefresh(false)}
        dismissLabel="Remind me later"
        className="pointer-events-auto pt-[max(0.625rem,env(safe-area-inset-top))]"
      >
        Reload to get the latest TaskMan.
      </Banner>
    );
  }

  if (!offlineReady) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 pb-[env(safe-area-inset-bottom)] sm:left-auto sm:right-4 sm:w-96">
      <div
        role="status"
        className="pointer-events-auto rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-lg"
      >
        <p className="font-medium text-slate-900">Ready to work offline</p>
      </div>
    </div>
  );
}
