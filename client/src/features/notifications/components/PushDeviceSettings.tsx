import { BellRing, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { usePushSubscription } from '../hooks/usePushSubscription';

/**
 * Turns Web Push on or off for this browser. The permission dialog opens only from the button,
 * never on load. Changes apply at once (unlike the preference switches, which wait for Save).
 */
const PushDeviceSettings = () => {
  const { t } = useTranslation('settings');
  const { state, busy, error, enable, disable } = usePushSubscription();

  return (
    <div className="space-y-3" data-testid="push-device">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <Smartphone className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="push-device-title" className="text-sm font-medium text-slate-900">{t('push.title')}</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            {t('push.description')}
          </p>
        </div>
      </div>

      <div aria-live="polite" className="text-sm">
        {state === 'checking' && <p className="text-slate-600">{t('push.checking')}</p>}

        {state === 'unsupported' && (
          <Alert tone="info" title={t('push.unsupportedTitle')}>
            {t('push.unsupported')}
          </Alert>
        )}

        {state === 'unavailable' && (
          <Alert tone="info" title={t('push.unavailableTitle')}>
            {t('push.unavailable')}
          </Alert>
        )}

        {state === 'denied' && (
          <Alert tone="warning" title={t('push.deniedTitle')}>
            {t('push.denied')}
          </Alert>
        )}

        {state === 'off' && <p className="text-slate-700">{t('push.off')}</p>}
        {state === 'on' && <p className="font-medium text-success-fg">{t('push.on')}</p>}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {(state === 'off' || state === 'on') && (
        <Button
          type="button"
          variant={state === 'on' ? 'outline' : 'default'}
          disabled={busy}
          onClick={() => void (state === 'on' ? disable() : enable())}
          className="h-11 gap-2 sm:h-10"
        >
          <BellRing className="size-4" aria-hidden />
          {busy
            ? (state === 'on' ? t('push.turningOff') : t('push.turningOn'))
            : (state === 'on' ? t('push.turnOff') : t('push.turnOn'))}
        </Button>
      )}
    </div>
  );
};

export default PushDeviceSettings;
