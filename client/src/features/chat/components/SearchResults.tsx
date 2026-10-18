import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { segmentSnippet, snippetFor } from '../lib/search';
import type { ChatMessage } from '../types';

/** Rows rendered at once; the selection can still walk every loaded result (spec NFR-026). */
const WINDOW = 80;

interface SearchResultsProps {
  results: ChatMessage[];
  term: string;
  activeIndex: number;
  loading: boolean;
  loadingMore: boolean;
  /** A message that could not be opened, e.g. deleted between the search and the jump. */
  notice: string;
  onSelect: (index: number) => void;
  onOpen: (message: ChatMessage) => void;
}

const whenOf = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

/**
 * The matches as a full-height listbox. One row is selected at a time and the selected row is kept in
 * view, so the arrow keys work without the pointer (spec AC-071, AC-072).
 */
export const SearchResults = ({
  results, term, activeIndex, loading, loadingMore, notice, onSelect, onOpen,
}: SearchResultsProps) => {
  const start = results.length <= WINDOW
    ? 0
    : Math.max(0, Math.min(activeIndex - Math.floor(WINDOW / 2), results.length - WINDOW));
  const visible = results.slice(start, start + WINDOW);
  const active = results[activeIndex];

  useEffect(() => {
    if (!active) return;
    document
      .getElementById(`chat-search-option-${active._id}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {notice && (
        <p role="alert" className="border-b border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg">
          {notice}
        </p>
      )}

      {loading && <p className="px-4 py-3 text-sm text-slate-500">Searching…</p>}

      {!loading && term.trim() === '' && (
        <p className="px-4 py-3 text-sm text-slate-500">Type to search this channel.</p>
      )}

      {!loading && term.trim() !== '' && results.length === 0 && (
        <p className="px-4 py-3 text-sm text-slate-500">No messages matched “{term}”.</p>
      )}

      {results.length > 0 && (
        <ul
          id="chat-search-results"
          role="listbox"
          aria-label="Search results"
          className="min-h-0 flex-1 overflow-y-auto py-1"
        >
          {visible.map((message, offset) => {
            const index = start + offset;
            const selected = index === activeIndex;
            const author = typeof message.author === 'string' ? 'Member' : message.author.name;
            return (
              <li
                key={message._id}
                id={`chat-search-option-${message._id}`}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(index);
                  onOpen(message);
                }}
                onMouseEnter={() => onSelect(index)}
                className={cn(
                  'flex cursor-pointer flex-col gap-0.5 border-l-2 px-3 py-2 outline-none',
                  selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-slate-50',
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate text-xs font-semibold text-slate-900', selected && 'text-primary')}>
                    {author}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{whenOf(message.createdAt)}</span>
                </span>
                <span className="line-clamp-2 text-sm text-slate-700">
                  {segmentSnippet(snippetFor(message.body || 'Attachment', term), term).map((segment, position) => (
                    segment.match
                      ? (
                        <mark key={position} className="rounded bg-warning-bg px-0.5 font-medium text-warning-fg">
                          {segment.text}
                        </mark>
                      )
                      : <span key={position}>{segment.text}</span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {loadingMore && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Loading more matches…</p>}
    </div>
  );
};

export default SearchResults;
