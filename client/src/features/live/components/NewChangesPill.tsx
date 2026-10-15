import { RefreshCw } from 'lucide-react';
import { flushLive, useLiveSnapshot } from '../lib/liveStore';

/**
 * "N new changes" button, shown while a drag or an unsaved form holds live refreshes back.
 * Pressing it applies them at once.
 */
const NewChangesPill = () => {
  const { pending } = useLiveSnapshot();
  if (pending === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-(--z-toast) flex justify-center max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={flushLive}
        className="pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-full border border-info-border bg-info-bg px-4 text-sm font-medium text-info-fg shadow-floating outline-none hover:brightness-95 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <RefreshCw className="size-4" aria-hidden />
        <span className="tabular-nums">{pending === 1 ? '1 new change' : `${pending} new changes`}</span>
        <span className="text-info-fg/80">· Refresh</span>
      </button>
    </div>
  );
};

export default NewChangesPill;
