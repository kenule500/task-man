import { useEffect, useState } from 'react';
import { TooltipHint } from '@/components/ds';
import { cn } from '@/lib/utils';
import { formatAgo } from '../lib/describe';
import { useLiveSnapshot } from '../lib/liveStore';

const REFRESH_LABEL_MS = 5000;

/** Re-renders every few seconds while `active`, so "updated 5 s ago" keeps moving. */
const useTicker = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Catch up at once when it starts, then tick
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), REFRESH_LABEL_MS);
    return () => clearInterval(timer);
  }, [active]);
  return now;
};

/**
 * Header dot that says whether the screen follows other people's changes:
 * "Up to date · updated 5 s ago", "Reconnecting…" or "Paused" (hidden tab, idle). Renders nothing until polling starts.
 */
const LiveIndicator = ({ className }: { className?: string }) => {
  const { state, lastSyncAt } = useLiveSnapshot();
  const now = useTicker(state === 'live');
  if (state === 'off') return null;

  const label = state === 'reconnecting'
    ? 'Reconnecting…'
    : state === 'paused'
      ? 'Paused · updates again when you are back'
      : `Up to date${lastSyncAt ? ` · updated ${formatAgo(now - lastSyncAt)}` : ''}`;
  const dot = state === 'live' ? 'bg-success-dot' : state === 'reconnecting' ? 'bg-warning-dot' : 'bg-slate-400';

  return (
    <TooltipHint label={label} side="bottom">
      <span
        tabIndex={0}
        role="img"
        aria-label={label}
        data-state={state}
        className={cn(
          'mr-1 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 outline-none focus-visible:outline-2 focus-visible:outline-primary md:h-9',
          className,
        )}
      >
        <span aria-hidden className={cn('size-2 rounded-full', dot)} />
        <span aria-hidden className="hidden lg:inline">{state === 'reconnecting' ? 'Reconnecting' : 'Live'}</span>
      </span>
    </TooltipHint>
  );
};

export default LiveIndicator;
