import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { MAX_LABELS, MAX_LABEL_LENGTH } from '../types';
import { addLabel, suggestLabels } from '../lib/labels';
import { LabelChip } from './TaskChips';

interface LabelInputProps {
  value: string[];
  onChange: (labels: string[]) => void;
  /** Labels already used in the workspace, offered as suggestions. */
  suggestions?: string[];
  id?: string;
  className?: string;
}

/** Chip input: Enter or comma adds, Backspace on an empty field removes the last label. */
const LabelInput = ({ value, onChange, suggestions = [], id, className }: LabelInputProps) => {
  const [draft, setDraft] = useState('');
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const full = value.length >= MAX_LABELS;
  const matches = full ? [] : suggestLabels(suggestions, value, draft);

  const commit = (raw: string) => {
    const next = addLabel(value, raw);
    if (next !== value) onChange(next);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter must not submit the surrounding form
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-1.5 focus-within:border-gray-400 sm:min-h-10">
        {value.map(label => (
          <LabelChip key={label} label={label} onRemove={removed => onChange(value.filter(item => item !== removed))} />
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={event => setDraft(event.target.value.replace(',', ''))}
          onKeyDown={handleKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
          disabled={full}
          maxLength={MAX_LABEL_LENGTH}
          placeholder={value.length === 0 ? 'Add a label and press Enter' : full ? '' : 'Add another'}
          autoComplete="off"
          aria-describedby={`${inputId}-hint`}
          className="min-w-24 flex-1 bg-transparent px-1 py-1 text-base text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed sm:text-sm"
        />
      </div>
      <p id={`${inputId}-hint`} className="text-xs text-slate-400">
        {full ? `Maximum of ${MAX_LABELS} labels reached.` : 'Press Enter or comma to add, Backspace to remove.'}{' '}
        <span className="tabular-nums">{value.length}/{MAX_LABELS}</span>
      </p>
      {matches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Label suggestions">
          <span className="text-xs text-slate-400">Suggestions:</span>
          {matches.map(label => (
            <button
              key={label}
              type="button"
              onClick={() => commit(label)}
              aria-label={`Add label ${label}`}
              className="rounded-md focus-visible:outline-2 focus-visible:outline-primary"
            >
              <LabelChip label={label} className="cursor-pointer hover:brightness-95" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LabelInput;
