import { useSyncExternalStore } from 'react';

// Tiny external store so `toast()` can be called from anywhere (handlers, hooks, tests),
// while <Toaster /> renders whatever is in it.

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before it disappears; `0` keeps it until dismissed. Errors stay longer by default. */
  duration?: number;
  /** One call-to-action, e.g. "Undo". Dismisses the toast after it runs. */
  action?: ToastAction;
  /** Keep the countdown running while the pointer is over the toast (time-critical toasts turn it off). */
  pauseOnHover?: boolean;
}

export interface ToastItem extends Required<Pick<ToastOptions, 'title' | 'tone' | 'duration' | 'pauseOnHover'>> {
  id: string;
  description?: string;
  action?: ToastAction;
}

export const DEFAULT_TOAST_DURATION = 5000;
export const ERROR_TOAST_DURATION = 8000;
const MAX_VISIBLE = 4;

let items: ToastItem[] = [];
let sequence = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSnapshot = () => items;

const show = (input: ToastOptions | string): string => {
  const options: ToastOptions = typeof input === 'string' ? { title: input } : input;
  const tone = options.tone ?? 'info';
  sequence += 1;
  const item: ToastItem = {
    id: `toast-${sequence}`,
    title: options.title,
    description: options.description,
    action: options.action,
    tone,
    duration: options.duration ?? (tone === 'error' ? ERROR_TOAST_DURATION : DEFAULT_TOAST_DURATION),
    pauseOnHover: options.pauseOnHover ?? true,
  };
  items = [...items, item].slice(-MAX_VISIBLE);
  emit();
  return item.id;
};

const dismiss = (id: string) => {
  if (!items.some(item => item.id === id)) return;
  items = items.filter(item => item.id !== id);
  emit();
};

const clear = () => {
  items = [];
  emit();
};

type ToastInput = Omit<ToastOptions, 'tone'> | string;
const withTone = (tone: ToastTone) => (input: ToastInput) =>
  show(typeof input === 'string' ? { title: input, tone } : { ...input, tone });

/** Shows a toast and returns its id. `toast.success('Saved')`, `toast.error(...)`, `toast({ title, action })`. */
export const toast = Object.assign(show, {
  success: withTone('success'),
  error: withTone('error'),
  info: withTone('info'),
  dismiss,
  clear,
});

/** Current toasts plus the helpers, for components. */
export const useToast = () => {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { toasts, toast, dismiss };
};
