import { useEffect, useState } from 'react';
import { Banner } from '@/components/ds';

/** Warning banner (design-system Banner) shown while the browser reports no network connection. */
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
    <Banner
      tone="warning"
      rounded={false}
      className="pointer-events-auto pt-[max(0.625rem,env(safe-area-inset-top))] font-medium"
    >
      You're offline. Changes can't be saved until you reconnect.
    </Banner>
  );
}
