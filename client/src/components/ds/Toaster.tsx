import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast, type ToastItem, type ToastTone } from './toastStore';

const TONE_ICON: Record<ToastTone, { Icon: typeof Info; className: string }> = {
  info: { Icon: Info, className: 'text-blue-300' },
  success: { Icon: CheckCircle2, className: 'text-emerald-400' },
  error: { Icon: CircleAlert, className: 'text-red-400' },
};

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

const ToastCard = ({ item, onDismiss }: ToastCardProps) => {
  const [paused, setPaused] = useState(false);
  // Time left, so pausing (hover/focus) resumes instead of restarting the countdown
  const remaining = useRef(item.duration);
  const { Icon, className: iconClass } = TONE_ICON[item.tone];

  useEffect(() => {
    if (item.duration <= 0 || paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [item.id, item.duration, paused, onDismiss]);

  const pause = () => item.pauseOnHover && setPaused(true);
  const resume = () => setPaused(false);

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      data-testid="toast"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-xl bg-inverse px-4 py-3 text-inverse-text shadow-lg ring-1 ring-white/10 sm:w-96 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium [overflow-wrap:anywhere]">{item.title}</p>
        {item.description && <p className="mt-0.5 text-xs text-inverse-muted [overflow-wrap:anywhere]">{item.description}</p>}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
          className="-my-1 min-h-9 shrink-0 rounded-md px-2 text-sm font-semibold text-blue-300 hover:bg-white/10 hover:text-[#BFDBFE] focus-visible:outline-2 focus-visible:outline-blue-300"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="-my-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white/10 hover:text-inverse-text focus-visible:outline-2 focus-visible:outline-blue-300"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
};

/**
 * Mount once near the app root. Renders the toasts created with `toast()` in a polite live region
 * (errors use `role="alert"`), bottom-center on phones and bottom-right from `sm`.
 */
export const Toaster = () => {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      role="region"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end sm:px-6"
    >
      {toasts.map(item => <ToastCard key={item.id} item={item} onDismiss={dismiss} />)}
    </div>
  );
};
