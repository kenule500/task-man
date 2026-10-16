import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTimeIn } from '@/i18n/format';
import { dayKeyOf, groupByDay, startsRun } from '../lib/messages';
import type { ChatMember, ChatMessage } from '../types';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: ChatMessage[];
  members: ChatMember[];
  selfId: string;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  /** Message the "new messages" divider goes above */
  dividerId: string | null;
  onEdit: (id: string, text: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 120;

/** "Today", "Yesterday" or the date, in the interface language. */
const useDayLabel = () => {
  const { t } = useTranslation('chat');
  return (date: Date): string => {
    const today = dayKeyOf(new Date());
    const yesterday = dayKeyOf(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const key = dayKeyOf(date);
    if (key === today) return t('messages.today');
    if (key === yesterday) return t('messages.yesterday');
    return formatDateTimeIn(date, { weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  };
};

/**
 * Scrolling history grouped by day. It follows new messages only while the reader is at the bottom (or wrote
 * the message); otherwise a "new messages" pill appears and the position does not move. Loading older messages
 * keeps the message under the reader in place.
 */
const MessageList = ({
  messages, members, selfId, hasMore, loadingOlder, onLoadOlder, dividerId, onEdit, onRemove,
}: MessageListProps) => {
  const { t } = useTranslation('chat');
  const dayLabel = useDayLabel();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLLIElement>(null);
  const previous = useRef<{ first?: string; last?: string; height: number }>({ height: 0 });
  // Whether the reader is at the bottom (written by the scroll handler, read when messages change)
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  // Newest message the reader has seen (they were at the bottom when it was there)
  const [seenId, setSeenId] = useState<string | null>(null);

  const lastId = messages[messages.length - 1]?._id ?? null;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    const before = previous.current;
    const first = messages[0]._id;
    const last = messages[messages.length - 1];

    if (before.last === undefined) {
      // First paint of this channel: the first unread message, else the latest
      if (dividerRef.current) dividerRef.current.scrollIntoView({ block: 'center' });
      else el.scrollTop = el.scrollHeight;
    } else if (first !== before.first && last._id === before.last) {
      // Older messages were added above: keep what the reader is looking at where it is
      el.scrollTop += el.scrollHeight - before.height;
    } else if (last._id !== before.last) {
      if (stick.current || last.author._id === selfId) el.scrollTop = el.scrollHeight;
    }
    previous.current = { first, last: last._id, height: el.scrollHeight };
  }, [messages, selfId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stick.current = bottom;
    setAtBottom(bottom);
    if (bottom && lastId) setSeenId(lastId);
    if (el.scrollTop < NEAR_TOP_PX && hasMore && !loadingOlder) onLoadOlder();
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const seenIndex = seenId ? messages.findIndex(message => message._id === seenId) : -1;
  const pending = seenIndex === -1 ? 0 : messages.slice(seenIndex + 1).filter(message => message.author._id !== selfId).length;
  const groups = groupByDay(messages);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        tabIndex={0}
        aria-label={t('messages.listLabel')}
        className="h-full overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5"
      >
        {hasMore && (
          <div className="flex justify-center pb-3">
            <Button type="button" variant="outline" size="sm" onClick={onLoadOlder} disabled={loadingOlder}>
              {loadingOlder && <Loader2 className="animate-spin" aria-hidden />}
              {loadingOlder ? t('messages.loadingOlder') : t('messages.loadOlder')}
            </Button>
          </div>
        )}

        {groups.map(group => (
          <section key={group.key} aria-label={dayLabel(group.date)}>
            <div className="sticky top-0 z-(--z-base) my-2 flex justify-center">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-xs font-medium text-slate-600 shadow-sm">
                {dayLabel(group.date)}
              </span>
            </div>
            <ul className="space-y-0.5">
              {group.messages.map((message, index) => {
                const run = startsRun(group.messages[index - 1], message);
                return (
                  <Fragment key={message._id}>
                    {message._id === dividerId && (
                      <li ref={dividerRef} className="flex items-center gap-3 py-2" aria-label={t('messages.newDivider')}>
                        <span aria-hidden className="h-px flex-1 bg-info-border" />
                        <span className="text-xs font-semibold text-info-fg">{t('messages.newDivider')}</span>
                        <span aria-hidden className="h-px flex-1 bg-info-border" />
                      </li>
                    )}
                    <MessageItem
                      message={message}
                      members={members}
                      own={message.author._id === selfId}
                      showHeader={run}
                      onEdit={onEdit}
                      onRemove={onRemove}
                    />
                  </Fragment>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {!atBottom && pending > 0 && (
        <Button
          type="button"
          size="sm"
          onClick={jumpToLatest}
          className="absolute bottom-3 start-1/2 -translate-x-1/2 gap-1.5 rounded-full bg-primary px-3 text-white shadow-floating hover:bg-primary-hover rtl:translate-x-1/2"
        >
          <ArrowDown aria-hidden />
          {t('messages.jumpToLatest', { pending })}
        </Button>
      )}
    </div>
  );
};

export default MessageList;
