import { useState } from 'react';
import { MessageSquarePlus, Plus } from 'lucide-react';
import type { ChatUser } from '../types';

interface NewDirectMessageProps {
  /** The chat member directory: everyone the caller may message. */
  members: ChatUser[];
  currentUserId: string | undefined;
  canStartDirect: boolean;
  onStartDirect: (userId: string) => void;
}

/**
 * The entry point for a private conversation. Rendered as a full-height row rather than a caption so
 * it is as visible as the conversations below it, and stays the first item of the panel (spec AC-065).
 */
export const NewDirectMessage = ({
  members, currentUserId, canStartDirect, onStartDirect,
}: NewDirectMessageProps) => {
  const [picking, setPicking] = useState(false);
  const others = members.filter(member => member._id !== currentUserId);

  if (!canStartDirect || others.length === 0) return null;

  return (
    <div className="px-2 py-1.5">
      <button
        type="button"
        aria-expanded={picking}
        aria-controls="new-direct-message-members"
        onClick={() => setPicking(value => !value)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-left text-sm font-medium text-slate-700 outline-none transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        {picking
          ? <Plus className="size-4 shrink-0 text-slate-500" aria-hidden />
          : <MessageSquarePlus className="size-4 shrink-0 text-primary" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">
          {picking ? 'Choose a teammate' : 'New direct message'}
        </span>
      </button>

      {picking && (
        <ul
          id="new-direct-message-members"
          aria-label="Teammates"
          className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white"
        >
          {others.map(member => (
            <li key={member._id}>
              <button
                type="button"
                onClick={() => {
                  onStartDirect(member._id);
                  setPicking(false);
                }}
                className="flex min-h-11 w-full items-center px-3 text-left text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              >
                <span className="truncate">{member.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default NewDirectMessage;
