import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Square, Timer } from 'lucide-react';
import { toast } from '@/components/ds';
import { PermissionContext } from '@/context/PermissionContext';
import { getApiErrorMessage } from '../api';
import { useNow, useRunningTimer } from '../hooks/useRunningTimer';
import { describeDuration, formatElapsed } from '../lib/duration';
import { stopTimer } from '../timerStore';

interface TimerPillProps {
  slug: string;
}

/**
 * The caller's running timer in the app header: task key and elapsed time (opens the task) and a stop button.
 * Renders nothing when no timer runs or the role cannot read tasks.
 */
const TimerPill = ({ slug }: TimerPillProps) => {
  const permissions = useContext(PermissionContext);
  const canRead = permissions ? !permissions.loading && permissions.can('tasks:read') : false;
  const canStop = permissions?.can('tasks:write') ?? false;
  const { timer } = useRunningTimer(slug, canRead);
  const now = useNow(Boolean(timer));
  const [stopping, setStopping] = useState(false);

  if (!timer || !canRead) return null;

  const elapsed = now - new Date(timer.startedAt).getTime();
  const label = timer.task.key || timer.task.title;

  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await stopTimer(slug, timer.task._id);
      toast.success(`Timer stopped on ${label}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not stop the timer.'));
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="mr-1 flex h-10 items-center rounded-lg border border-info-border bg-info-bg text-info-fg md:h-9">
      <Link
        to={`/${slug}/tasks?task=${encodeURIComponent(timer.task._id)}`}
        title={timer.task.title}
        aria-label={`Timer running on ${label} for ${describeDuration(Math.floor(elapsed / 60_000))}. Open the task.`}
        className="flex h-full min-w-0 items-center gap-1.5 rounded-l-lg pl-2.5 pr-1.5 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Timer className="size-4 shrink-0" aria-hidden />
        {timer.task.key && <span className="hidden max-w-24 truncate font-mono text-xs sm:inline">{timer.task.key}</span>}
        <span className="tabular-nums" aria-hidden>{formatElapsed(elapsed)}</span>
      </Link>
      {canStop && (
        <button
          type="button"
          onClick={() => { void stop(); }}
          disabled={stopping}
          aria-label={`Stop the timer on ${label}`}
          className="flex h-full w-10 items-center justify-center rounded-r-lg outline-none hover:bg-info-border/60 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 md:w-9"
        >
          <Square className="size-3.5 fill-current" aria-hidden />
        </button>
      )}
    </div>
  );
};

export default TimerPill;
