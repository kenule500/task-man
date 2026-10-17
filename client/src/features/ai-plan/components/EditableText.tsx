import { useId, useState, type KeyboardEvent } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface EditableTextProps {
  value: string;
  onSave: (value: string) => void;
  /** Names the field for screen readers ("Title of Browse the catalogue"). */
  label: string;
  maxLength: number;
  multiline?: boolean;
  /** Shown while the value is empty. */
  placeholder?: string;
  /** An empty value is refused (the previous one is kept). */
  required?: boolean;
  className?: string;
}

/**
 * Click-to-edit text. Enter (Ctrl+Enter in a multi-line field) or leaving the field saves, Escape cancels.
 * The text wraps, so long titles stay readable on a phone.
 */
export const EditableText = ({ value, onSave, label, maxLength, multiline = false, placeholder, required = false, className }: EditableTextProps) => {
  const { t } = useTranslation('aiPlan');
  const [draft, setDraft] = useState<string | null>(null);
  const hintId = useId();

  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === value || (required && next === '')) return;
    onSave(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setDraft(null);
    } else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    }
  };

  if (draft !== null) {
    const shared = {
      'aria-label': label,
      'aria-describedby': hintId,
      value: draft,
      maxLength,
      autoFocus: true,
      onBlur: commit,
      onKeyDown,
      className: cn('block w-full rounded-md border border-border-strong bg-surface-raised px-2 py-1.5 text-base text-text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 md:text-sm', className),
    };
    return (
      <>
        {multiline
          ? <textarea {...shared} rows={3} onChange={event => setDraft(event.target.value)} />
          : <input {...shared} onChange={event => setDraft(event.target.value)} />}
        <span id={hintId} className="sr-only">{multiline ? t('edit.hintMultiline') : t('edit.hint')}</span>
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(value)}
      className={cn(
        'group/edit -mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1 text-start break-words whitespace-pre-wrap outline-none',
        'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-primary',
        !value && 'text-text-subtle italic',
        className,
      )}
    >
      {value || placeholder || t('edit.empty')}
      <span className="sr-only"> {t('edit.edit', { label })}</span>
      <Pencil aria-hidden className="ms-1.5 inline size-3 text-text-faint opacity-0 group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100" />
    </button>
  );
};
