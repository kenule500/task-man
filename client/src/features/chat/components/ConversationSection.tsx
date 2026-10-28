import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ConversationRow } from './ConversationRow';
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

/**
 * One segmented list of conversations: a heading, the shared conversation rows and a footline.
 * Direct messages and team channels render through this so both read the same way (spec AC-056);
 * the rows themselves live in `ConversationRow`, which the merged conversation list reuses.
 */
export const ConversationSection = ({
  title, items, currentChannelId, loading, loadingCopy, emptyCopy, footer,
  canManage = false, onSelect, onOpenSettings, className,
}: ConversationSectionProps) => {
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
        {items.map(card => (
          <ConversationRow
            key={card._id}
            card={card}
            active={card._id === currentChannelId}
            canManage={canManage}
            onSelect={onSelect}
            onOpenSettings={onOpenSettings}
          />
        ))}
      </ul>

      <p className="px-3 py-2 text-[11px] text-slate-400">{footer}</p>
    </nav>
  );
};

export default ConversationSection;
