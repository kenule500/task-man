import { useEffect, useState } from 'react';

/** Amber banner shown while the browser reports no network connection. */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-center text-sm font-medium text-amber-800"
    >
      You're offline. Changes can't be saved until you reconnect.
    </div>
  );
}
