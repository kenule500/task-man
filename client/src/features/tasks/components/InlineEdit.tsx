import { useState, type KeyboardEvent } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '../lib/date';

interface InlineTextProps {
  value: string;
  onSave: (value: string) => void;
  label: string;
  className?: string;
  inputClassName?: string;
}

/**
 * Click-to-edit text. Enter or blur saves, Escape cancels.
 * Empty values are rejected (the previous value is kept).
 */
export const InlineText = ({ value, onSave, label, className, inputClassName }: InlineTextProps) => {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== value) onSave(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') setDraft(null);
  };

  if (draft !== null) {
    return (
      <input
        aria-label={label}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        maxLength={140}
        autoFocus
        className={cn('w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-base text-slate-900 md:text-sm outline-none focus:border-primary', inputClassName)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(value)}
      title="Click to rename"
      className={cn('block w-full truncate rounded-md px-2 py-1 -mx-2 text-left hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary', className)}
    >
      {value}
    </button>
  );
};

interface InlineDateProps {
  value: string;
  onSave: (value: string) => void;
  label: string;
  min?: string;
  className?: string;
}

/**
 * Shows the date in the app format ("Oct 1, 2026"); clicking opens the native picker.
 * The real `<input type="date">` sits on top (transparent) so keyboard entry still works.
 */
export const InlineDate = ({ value, onSave, label, min, className }: InlineDateProps) => (
  <span className={cn('relative inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs tabular-nums hover:bg-slate-100 focus-within:ring-2 focus-within:ring-primary/30', className)}>
    <CalendarDays className="size-3" aria-hidden />
    {formatDate(value)}
    <input
      type="date"
      aria-label={label}
      value={value}
      min={min}
      onClick={event => {
        try {
          event.currentTarget.showPicker();
        } catch {
          // Unsupported or blocked (e.g. cross-origin iframe): native focus still works
        }
      }}
      onChange={event => event.target.value && event.target.value !== value && onSave(event.target.value)}
      className="absolute inset-0 cursor-pointer opacity-0"
    />
  </span>
);
