import { cn } from '@/lib/utils';
import { describeDuration, describeProgress, timeProgress } from '../lib/duration';

interface TimeProgressBarProps {
  logged: number;
  estimate: number | null | undefined;
  className?: string;
}

/** Logged time against the estimate. Over the estimate the bar turns warning and the text says "over". */
const TimeProgressBar = ({ logged, estimate, className }: TimeProgressBarProps) => {
  const progress = timeProgress(logged, estimate);
  const summary = describeProgress(logged, estimate);
  return (
    <div className={cn('space-y-1.5', className)}>
      {progress && (
        <div
          role="progressbar"
          aria-label="Logged time against the estimate"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-valuetext={`${describeDuration(logged)} logged of ${describeDuration(estimate ?? 0)}${progress.over ? `, ${describeDuration(progress.overBy)} over` : ''}`}
          className="h-2 overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', progress.over ? 'bg-warning-dot' : 'bg-primary')}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
      <p className={cn('text-sm tabular-nums', progress?.over ? 'font-medium text-warning-fg' : 'text-slate-600')} aria-live="polite">
        {summary}
      </p>
    </div>
  );
};

export default TimeProgressBar;
