import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ds';
import { avatarSrc } from '../lib/avatar';
import { unreadLabel } from '../lib/conversations';
import type { ConversationCard } from '../types';

interface ConversationRowProps {
  card: ConversationCard;
  active: boolean;
  /** Rows that offer rename and avatar settings (project channels only). */
  canManage?: boolean;
  onSelect: (channelId: string) => void;
  onOpenSettings?: (card: ConversationCard) => void;
}

const previewOf = (card: ConversationCard): string => {
  if (!card.lastMessage) return 'No messages yet';
  const author = card.lastMessage.authorName ? `${card.lastMessage.authorName}: ` : '';
  const body = card.lastMessage.body || 'Attachment';
  return `${author}${body}`.slice(0, 80);
};

/**
 * One conversation row: avatar, name, last-message preview and an unread badge.
 *
 * Every kind of conversation renders through this row - the seeded channel, a project channel and a
 * direct message - so the merged list reads identically for all of them (AC-056, AC-114).
 */
export const ConversationRow = ({
  card, active, canManage = false, onSelect, onOpenSettings,
}: ConversationRowProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onSelect(card._id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left outline-none transition-colors',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
          active ? 'bg-slate-100' : 'hover:bg-slate-50',
        )}
      >
        <UserAvatar name={card.name} src={avatarSrc(card.avatarUrl)} size="sm" />
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="flex items-baseline gap-1.5">
            <span className={cn('truncate text-sm', card.unread && !active ? 'font-semibold text-slate-900' : 'text-slate-800')}>
              {card.name}
            </span>
            {card.archived && (
              <span className="shrink-0 rounded bg-slate-200 px-1 text-[10px] uppercase tracking-wide text-slate-600">
                Archived
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-slate-500">{previewOf(card)}</span>
        </span>
        {card.unread && !active && (
          <>
            <span
              aria-hidden
              className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-white"
            >
              {unreadLabel(card.unreadCount ?? 1)}
            </span>
            <span className="sr-only">
              {card.unreadCount === 1 ? '1 unread message' : `${card.unreadCount ?? 1} unread messages`}
            </span>
          </>
        )}
      </button>

      {canManage && onOpenSettings && hovered && (
        <button
          type="button"
          aria-label={`Settings for ${card.name}`}
          onClick={event => {
            event.stopPropagation();
            onOpenSettings(card);
          }}
          className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md bg-white/90 text-slate-500 shadow-sm outline-none hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Settings2 className="size-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
};

export default ConversationRow;
