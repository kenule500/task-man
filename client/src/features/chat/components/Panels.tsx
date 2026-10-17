import { X } from 'lucide-react';
import type { ChatMessage } from '../types';

const timeOf = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface SearchPanelProps {
  term: string;
  results: ChatMessage[];
  loading: boolean;
  onTermChange: (term: string) => void;
  onClose: () => void;
}

/** Search results for one channel; each result can be jumped to. */
export const SearchPanel = ({ term, results, loading, onTermChange, onClose }: SearchPanelProps) => (
  <section aria-label="Search results" className="border-b border-slate-200 bg-slate-50/70 p-3">
    <div className="flex items-center gap-2">
      <input
        value={term}
        autoFocus
        aria-label="Search this channel"
        placeholder="Search this channel…"
        onChange={event => onTermChange(event.target.value)}
        className="min-h-9 flex-1 rounded-md border border-slate-300 px-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-primary"
      />
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="flex size-8 items-center justify-center rounded-md text-slate-500 outline-none hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>

    <div className="mt-2 max-h-56 overflow-y-auto">
      {loading && <p className="text-xs text-slate-500">Searching…</p>}
      {!loading && term.trim() !== '' && results.length === 0 && (
        <p className="text-xs text-slate-500">No messages matched “{term}”.</p>
      )}
      <ul className="space-y-1">
        {results.map(result => (
          <li key={result._id} className="rounded-md bg-white px-2 py-1.5">
            <p className="text-xs font-semibold text-slate-900">
              {typeof result.author === 'string' ? 'Member' : result.author.name}
              <span className="ml-2 font-normal text-slate-400">{timeOf(result.createdAt)}</span>
            </p>
            <p className="truncate text-sm text-slate-700">{result.body}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

interface PinnedPanelProps {
  pinned: ChatMessage[];
  loading: boolean;
  onClose: () => void;
}

/** The channel's pinned messages, most recently pinned first. */
export const PinnedPanel = ({ pinned, loading, onClose }: PinnedPanelProps) => (
  <section aria-label="Pinned messages" className="border-b border-slate-200 bg-warning-bg p-3">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-900">Pinned</h2>
      <button
        type="button"
        aria-label="Close pinned messages"
        onClick={onClose}
        className="flex size-8 items-center justify-center rounded-md text-slate-500 outline-none hover:bg-warning-border/40 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
    {loading && <p className="mt-1 text-xs text-slate-500">Loading…</p>}
    {!loading && pinned.length === 0 && <p className="mt-1 text-xs text-slate-500">Nothing is pinned in this channel.</p>}
    <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
      {pinned.map(message => (
        <li key={message._id} className="rounded-md bg-white px-2 py-1.5">
          <p className="text-xs font-semibold text-slate-900">
            {typeof message.author === 'string' ? 'Member' : message.author.name}
          </p>
          <p className="truncate text-sm text-slate-700">{message.body}</p>
        </li>
      ))}
    </ul>
  </section>
);

export default SearchPanel;
