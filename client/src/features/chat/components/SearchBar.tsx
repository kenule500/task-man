import type { KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

interface SearchBarProps {
  term: string;
  /** Position copy, e.g. `3 of 12` (spec AC-073). */
  counter: string;
  hasResults: boolean;
  /** Id of the selected row, so the active option is announced from the input (AC-075). */
  activeOptionId?: string;
  onChange: (term: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * The find bar: an editor-style search strip, not a popup. Focus stays in the input while the arrow
 * keys walk the result list, which is the behaviour that makes this feel like VS Code (spec §17).
 */
export const SearchBar = ({
  term, counter, hasResults, activeOptionId, onChange, onPrevious, onNext, onOpen, onClose,
}: SearchBarProps) => {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onNext();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onPrevious();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onOpen();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <section
      aria-label="Search this channel"
      className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2"
    >
      <input
        autoFocus
        value={term}
        role="combobox"
        aria-expanded={hasResults}
        aria-controls="chat-search-results"
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        aria-label="Search this channel"
        placeholder="Search this channel…"
        onChange={event => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-9 min-w-40 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-primary"
      />

      <span
        aria-hidden
        className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white"
      >
        <button
          type="button"
          aria-label="Previous match"
          disabled={!hasResults}
          onClick={onPrevious}
          className="flex size-8 items-center justify-center rounded-l-md text-slate-500 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
        >
          <ChevronUp className="size-4" aria-hidden />
        </button>
        <span aria-hidden className="h-5 w-px bg-slate-200" />
        <button
          type="button"
          aria-label="Next match"
          disabled={!hasResults}
          onClick={onNext}
          className="flex size-8 items-center justify-center rounded-r-md text-slate-500 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
        >
          <ChevronDown className="size-4" aria-hidden />
        </button>
      </span>

      <output
        aria-live="polite"
        className="min-w-16 text-center text-xs tabular-nums text-slate-500"
      >
        {counter}
      </output>

      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="flex size-8 items-center justify-center rounded-md text-slate-500 outline-none hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X className="size-4" aria-hidden />
      </button>
    </section>
  );
};

export default SearchBar;
