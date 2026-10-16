import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/components/ds';

/** Warning banner (design-system Banner) shown while the browser reports no network connection. */
export default function OfflineBanner() {
  const { t } = useTranslation('nav');
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
      {t('pwa.offline')}
    </Banner>
  );
}
