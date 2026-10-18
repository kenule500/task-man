import { X } from 'lucide-react';
import type { ChatMessage } from '../types';

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

export default PinnedPanel;
