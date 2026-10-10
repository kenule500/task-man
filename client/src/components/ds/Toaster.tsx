import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotionSafe } from '@/lib/motion';
import { useToast, type ToastItem, type ToastTone } from './toastStore';

const TONE_ICON: Record<ToastTone, { Icon: typeof Info; className: string }> = {
  info: { Icon: Info, className: 'text-blue-300' },
  success: { Icon: CheckCircle2, className: 'text-success-dot' },
  error: { Icon: CircleAlert, className: 'text-danger-dot' },
};

/** A swipe further than this (pixels) dismisses the toast on touch screens. */
const SWIPE_DISMISS_PX = 80;
const EXIT_MS = 120;

/**
 * Plays the exit of a toast that is being removed: the node is copied, pinned where it was and faded out, so the
 * real toast can leave the list at once (the others close the gap immediately and nothing waits on the animation).
 */
const playExit = (node: HTMLElement) => {
  if (typeof node.animate !== 'function') return;
  const box = node.getBoundingClientRect();
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('role');
  ghost.removeAttribute('data-testid');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed', top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, margin: '0',
    pointerEvents: 'none', animation: 'none',
  });
  document.body.appendChild(ghost);
  const exit = ghost.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(0.96)' }],
    { duration: EXIT_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  );
  const cleanup = () => ghost.remove();
  exit.addEventListener('finish', cleanup);
  exit.addEventListener('cancel', cleanup);
};

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

const ToastCard = ({ item, onDismiss }: ToastCardProps) => {
  const [paused, setPaused] = useState(false);
  // Time left, so pausing (hover/focus) resumes instead of restarting the countdown
  const remaining = useRef(item.duration);
  const node = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ startX: number; dx: number } | null>(null);
  const reduced = useReducedMotionSafe();
  const { Icon, className: iconClass } = TONE_ICON[item.tone];

  const close = useCallback(() => {
    if (!reduced && node.current) playExit(node.current);
    onDismiss(item.id);
  }, [item.id, onDismiss, reduced]);

  useEffect(() => {
    if (item.duration <= 0 || paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(close, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [item.duration, paused, close]);

  const pause = () => item.pauseOnHover && setPaused(true);
  const resume = () => setPaused(false);

  // Swipe sideways to dismiss (touch only). The card follows the finger and fades; a short swipe springs back.
  const swipeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || (event.target as HTMLElement).closest('button')) return;
    swipe.current = { startX: event.clientX, dx: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.style.transition = 'none';
  };
  const swipeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = swipe.current;
    if (!state) return;
    state.dx = event.clientX - state.startX;
    event.currentTarget.style.transform = `translateX(${state.dx}px)`;
    event.currentTarget.style.opacity = String(1 - Math.min(1, Math.abs(state.dx) / 240));
  };
  const swipeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = swipe.current;
    swipe.current = null;
    if (!state) return;
    if (Math.abs(state.dx) > SWIPE_DISMISS_PX) {
      onDismiss(item.id);
      return;
    }
    const element = event.currentTarget;
    element.style.transition = 'transform 220ms var(--ease-spring-soft), opacity 220ms linear';
    element.style.transform = '';
    element.style.opacity = '';
  };

  return (
    <div
      ref={node}
      role={item.tone === 'error' ? 'alert' : 'status'}
      data-testid="toast"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      onPointerDown={swipeStart}
      onPointerMove={swipeMove}
      onPointerUp={swipeEnd}
      onPointerCancel={swipeEnd}
      className="pointer-events-auto flex w-full touch-pan-y items-start gap-3 rounded-xl bg-inverse px-4 py-3 text-inverse-text shadow-lg ring-1 ring-white/10 sm:w-96 motion-safe:animate-tm-toast-in"
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
            close();
          }}
          className="-my-1 min-h-9 shrink-0 rounded-md px-2 text-sm font-semibold text-blue-300 hover:bg-white/10 hover:text-[#BFDBFE] focus-visible:outline-2 focus-visible:outline-blue-300"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={close}
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
 * (errors use `role="alert"`), bottom-center on phones and bottom-right from `sm`. Toasts spring in, fade out
 * and can be swiped away on touch screens.
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
