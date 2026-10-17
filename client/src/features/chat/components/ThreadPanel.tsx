import { X } from 'lucide-react';
import type { ChatMessage, Reaction, ChatUser } from '../types';

interface ThreadPanelProps {
  parent: ChatMessage;
  replies: ChatMessage[];
  reactions: Record<string, Reaction[]>;
  members: ChatUser[];
  currentUserId: string | undefined;
  canWrite: boolean;
  loading: boolean;
  onClose: () => void;
  onSend: (body: string, options: { parentId: string; mentionIds: string[]; attachmentIds: string[] }) => Promise<void>;
}

const timeOf = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
};

/** Replies of one message, beside the channel so the conversation is not lost. */
export const ThreadPanel = ({
  parent, replies, currentUserId, canWrite, loading, onClose, onSend, members,
}: ThreadPanelProps) => (
  <aside
    aria-label="Thread"
    className="flex w-full max-w-sm shrink-0 flex-col border-l border-slate-200 bg-white md:w-80"
  >
    <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
      <h2 className="text-sm font-semibold text-slate-900">Thread</h2>
      <button
        type="button"
        aria-label="Close thread"
        onClick={onClose}
        className="flex size-7 items-center justify-center rounded-md text-slate-500 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{parent.body}</p>
      <p className="mt-1 text-xs text-slate-400">{timeOf(parent.createdAt)}</p>

      <hr className="my-3 border-slate-200" />

      {loading && <p className="text-xs text-slate-500">Loading replies…</p>}
      {!loading && replies.length === 0 && (
        <p className="text-xs text-slate-500">No replies yet. Start the thread below.</p>
      )}

      <ul className="space-y-3">
        {replies.map(reply => (
          <li key={reply._id}>
            <p className="text-xs font-semibold text-slate-900">
              {typeof reply.author === 'string' ? 'Member' : reply.author.name}
              {reply.deletedAt && <span className="ml-1 font-normal italic text-slate-400">(deleted)</span>}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
              {reply.deletedAt ? 'This message was deleted' : reply.body}
            </p>
            <p className="text-[11px] text-slate-400">{timeOf(reply.createdAt)}</p>
          </li>
        ))}
      </ul>
    </div>

    {canWrite && (
      <ThreadComposer parentId={parent._id} members={members} currentUserId={currentUserId} onSend={onSend} />
    )}
  </aside>
);

interface ThreadComposerProps {
  parentId: string;
  members: ChatUser[];
  currentUserId: string | undefined;
  onSend: (body: string, options: { parentId: string; mentionIds: string[]; attachmentIds: string[] }) => Promise<void>;
}

const ThreadComposer = ({ parentId, onSend }: ThreadComposerProps) => (
  <form
    className="border-t border-slate-200 p-2"
    onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const field = form.elements.namedItem('reply') as HTMLTextAreaElement | null;
      const value = field?.value.trim() ?? '';
      if (!value) return;
      await onSend(value, { parentId, mentionIds: [], attachmentIds: [] });
      if (field) field.value = '';
    }}
  >
    <textarea
      name="reply"
      rows={2}
      aria-label="Reply in thread"
      placeholder="Reply…"
      className="w-full resize-none rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-primary"
    />
    <button type="submit" className="mt-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white">
      Reply
    </button>
  </form>
);

export default ThreadPanel;
