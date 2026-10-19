import { useState, type ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ds';
import { avatarSrc } from '../lib/avatar';
import { unreadLabel } from '../lib/conversations';
import type { ConversationCard } from '../types';

interface ConversationSectionProps {
  /** Section heading, e.g. "Direct messages" or "Team channels". */
  title: string;
  items: ConversationCard[];
  currentChannelId: string | undefined;
  loading: boolean;
  loadingCopy: string;
  /** Shown instead of the list when there is nothing to show. */
  emptyCopy: string;
  /** Footline explaining who can read the section. */
  footer: ReactNode;
  /** Rows that offer rename and avatar settings (team channels only). */
  canManage?: boolean;
  onSelect: (channelId: string) => void;
  onOpenSettings?: (card: ConversationCard) => void;
  className?: string;
}

const previewOf = (card: ConversationCard): string => {
  if (!card.lastMessage) return 'No messages yet';
  const author = card.lastMessage.authorName ? `${card.lastMessage.authorName}: ` : '';
  const body = card.lastMessage.body || 'Attachment';
  return `${author}${body}`.slice(0, 80);
};

/**
 * One segmented list of conversations: a heading, rows carrying avatar, name, last-message preview and
 * an unread dot, and a footline. Direct messages and team channels render through this so both read the
 * same way (spec AC-056).
 */
export const ConversationSection = ({
  title, items, currentChannelId, loading, loadingCopy, emptyCopy, footer,
  canManage = false, onSelect, onOpenSettings, className,
}: ConversationSectionProps) => {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <nav aria-label={title} className={cn('flex flex-col', className)}>
      <h2 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>

      {loading && <p className="px-3 py-2 text-xs text-slate-500">{loadingCopy}</p>}

      {!loading && items.length === 0 && (
        <p className="px-3 py-2 text-xs text-slate-500">{emptyCopy}</p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.map(card => {
          const active = card._id === currentChannelId;
          return (
            <li key={card._id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(card._id)}
                onMouseEnter={() => setHovered(card._id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(card._id)}
                onBlur={() => setHovered(null)}
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

              {canManage && onOpenSettings && hovered === card._id && (
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
        })}
      </ul>

      <p className="px-3 py-2 text-[11px] text-slate-400">{footer}</p>
    </nav>
  );
};

export default ConversationSection;
