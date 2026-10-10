import { BellRing, Smartphone } from 'lucide-react';
import { Alert } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { usePushSubscription } from '../hooks/usePushSubscription';

/**
 * Turns Web Push on or off for this browser. The permission dialog opens only from the button,
 * never on load. Changes apply at once (unlike the preference switches, which wait for Save).
 */
const PushDeviceSettings = () => {
  const { state, busy, error, enable, disable } = usePushSubscription();

  return (
    <div className="space-y-3" data-testid="push-device">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <Smartphone className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="push-device-title" className="text-sm font-medium text-slate-900">Push notifications on this device</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Get a system notification for assignments, mentions and comments, even when TaskMan is closed.
            Each device and browser is set up on its own.
          </p>
        </div>
      </div>

      <div aria-live="polite" className="text-sm">
        {state === 'checking' && <p className="text-slate-600">Checking this device...</p>}

        {state === 'unsupported' && (
          <Alert tone="info" title="Not available in this browser">
            Push notifications are not supported here. On iPhone and iPad they work once TaskMan is added to the Home
            Screen (Share, then Add to Home Screen) and opened from there.
          </Alert>
        )}

        {state === 'unavailable' && (
          <Alert tone="info" title="Not set up on this server">
            Push notifications are turned off for this TaskMan server. In-app notifications and emails still work.
          </Alert>
        )}

        {state === 'denied' && (
          <Alert tone="warning" title="Notifications are blocked">
            Your browser blocks notifications for TaskMan. To turn them on, allow notifications for this site in your
            browser settings (usually the icon next to the address bar), then reload this page.
          </Alert>
        )}

        {state === 'off' && <p className="text-slate-700">Push is off on this device.</p>}
        {state === 'on' && <p className="font-medium text-emerald-800">Push is on for this device.</p>}
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
            ? (state === 'on' ? 'Turning off...' : 'Turning on...')
            : (state === 'on' ? 'Turn off on this device' : 'Turn on for this device')}
        </Button>
      )}
    </div>
  );
};

export default PushDeviceSettings;
