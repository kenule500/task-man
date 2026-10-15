import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tag } from './primitives';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Existing tags offered as one-tap suggestions while typing. */
  suggestions?: string[];
  id?: string;
  /** Singular noun used in labels and hints: "label" gives "Add label X" and "Maximum of 10 labels reached." */
  noun?: string;
  /** Most tags allowed. */
  max?: number;
  /** Longest tag, enforced on input and when committing. */
  maxLength?: number;
  /** Replaces the default chip (e.g. a colored label chip). `onRemove` is given for selected tags and omitted for suggestions (render no remove button then). */
  renderTag?: (tag: string, onRemove?: (tag: string) => void) => ReactNode;
  className?: string;
}

const normalize = (raw: string, maxLength: number) => raw.trim().replace(/\s+/g, ' ').slice(0, maxLength);

/**
 * Free-text chip input. Enter or comma adds the typed tag, Backspace on an empty field removes the last one,
 * blur commits what was typed. Duplicates (case-insensitive) and empty tags are ignored.
 */
export const TagInput = ({
  value, onChange, suggestions = [], id, noun = 'tag', max = 10, maxLength = 30, renderTag, className,
}: TagInputProps) => {
  const [draft, setDraft] = useState('');
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const full = value.length >= max;

  const taken = new Set(value.map(tag => tag.toLowerCase()));
  const term = draft.trim().toLowerCase();
  const matches = full ? [] : suggestions.filter(tag => !taken.has(tag.toLowerCase()) && tag.toLowerCase().includes(term)).slice(0, 6);

  const remove = (tag: string) => onChange(value.filter(item => item !== tag));

  const commit = (raw: string) => {
    const tag = normalize(raw, maxLength);
    if (tag && !full && !taken.has(tag.toLowerCase())) onChange([...value, tag]);
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
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-white px-2 py-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 sm:min-h-10">
        {value.map(tag => (
          renderTag ? <span key={tag} className="contents">{renderTag(tag, remove)}</span> : (
            <Tag key={tag} className="gap-1 pr-0.5">
              <span className="truncate">{tag}</span>
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Remove ${noun} ${tag}`}
                className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-focus"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Tag>
          )
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={event => setDraft(event.target.value.replace(',', ''))}
          onKeyDown={handleKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
          disabled={full}
          maxLength={maxLength}
          placeholder={value.length === 0 ? `Add a ${noun} and press Enter` : full ? '' : 'Add another'}
          autoComplete="off"
          aria-describedby={`${inputId}-hint`}
          className="min-w-24 flex-1 bg-transparent px-1 py-1 text-base text-text-strong outline-none placeholder:text-text-subtle disabled:cursor-not-allowed sm:text-sm"
        />
      </div>
      <p id={`${inputId}-hint`} className="text-xs text-text-subtle">
        {full ? `Maximum of ${max} ${noun}s reached.` : 'Press Enter or comma to add, Backspace to remove.'}{' '}
        <span className="tabular-nums">{value.length}/{max}</span>
      </p>
      {matches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${noun[0].toUpperCase()}${noun.slice(1)} suggestions`}>
          <span className="text-xs text-text-subtle">Suggestions:</span>
          {matches.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => commit(tag)}
              aria-label={`Add ${noun} ${tag}`}
              className="rounded-md focus-visible:outline-2 focus-visible:outline-focus"
            >
              {renderTag ? renderTag(tag) : <Tag className="cursor-pointer hover:brightness-95">{tag}</Tag>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
