import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { editList, PLAN_LIMITS } from '../lib/plan';

interface StringListEditorProps {
  /** Heading of the list ("Acceptance criteria"). */
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  /** Accessible name of the n-th row ("Criterion 2 of Browse the catalogue"). */
  rowLabel: (index: number) => string;
  /** Accessible name of the remove button of the n-th row. */
  removeLabel: (index: number) => string;
  addLabel: string;
  max?: number;
  maxLength?: number;
  /** Smaller heading and spacing, for a list inside a subtask. */
  compact?: boolean;
}

/** An editable list of short texts (acceptance criteria): one field per row, remove and add buttons. */
export const StringListEditor = ({
  title, items, onChange, rowLabel, removeLabel, addLabel, max = PLAN_LIMITS.criteria, maxLength = PLAN_LIMITS.criterion, compact = false,
}: StringListEditorProps) => {
  const { t } = useTranslation('aiPlan');
  const lastRef = useRef<HTMLInputElement | null>(null);
  const full = items.length >= max;

  const add = () => {
    if (full) return;
    onChange([...items, '']);
    // The new (empty) row takes focus once it exists
    requestAnimationFrame(() => lastRef.current?.focus());
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className={compact ? 'text-xs font-medium text-text-subtle' : 'text-sm font-semibold text-text-strong'}>{title}</h4>
        <span className="text-xs tabular-nums text-text-subtle" aria-label={t('list.count', { count: items.length, max })}>{items.length}/{max}</span>
      </div>
      {items.length === 0 && <p className="text-xs text-text-subtle">{t('list.empty')}</p>}
      <ul className="space-y-1.5">
        {items.map((text, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <Input
              ref={index === items.length - 1 ? lastRef : undefined}
              value={text}
              maxLength={maxLength}
              aria-label={rowLabel(index)}
              onChange={event => onChange(editList(items, index, event.target.value))}
              className="h-10 min-w-0 flex-1 rounded-lg border-border-strong bg-surface-raised text-base shadow-none md:h-9 md:text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={removeLabel(index)}
              onClick={() => onChange(editList(items, index, null))}
              className="size-10 shrink-0 text-text-subtle hover:text-danger-fg md:size-9"
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={add}
        disabled={full}
        className="h-10 gap-1.5 px-2 text-primary md:h-8"
      >
        <Plus aria-hidden className="size-3.5" /> {full ? t('list.full', { max }) : addLabel}
      </Button>
    </div>
  );
};
