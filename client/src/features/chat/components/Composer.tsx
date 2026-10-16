import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SendHorizontal } from 'lucide-react';
import { toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/utils/api';
import { COUNTER_FROM, MAX_MESSAGE_LENGTH } from '../lib/limits';
import { filterMembers, findMentionQuery, insertMention } from '../lib/mentions';
import type { ChatMember } from '../types';
import ChatAvatar from './ChatAvatar';

interface ComposerProps {
  /** Shown in the placeholder, e.g. "# general" */
  channelName: string;
  members: ChatMember[];
  selfId: string;
  /** Text kept from the last time this channel was open */
  initialDraft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => Promise<void>;
  onTyping: () => void;
}

/**
 * Message box. Enter sends, Shift+Enter adds a line. Typing "@" opens a list of members (arrow keys and
 * Enter or Tab to pick, Escape to close). Mount it with `key={channelId}`.
 */
const Composer = ({ channelName, members, selfId, initialDraft, onDraftChange, onSend, onTyping }: ComposerProps) => {
  const { t } = useTranslation('chat');
  const [text, setText] = useState(initialDraft);
  const [caret, setCaret] = useState(initialDraft.length);
  const [highlight, setHighlight] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const listId = useId();

  const mention = findMentionQuery(text, caret);
  const suggestions = mention ? filterMembers(members, mention.query, selfId) : [];
  const listOpen = Boolean(mention) && suggestions.length > 0 && dismissedAt !== mention?.start;
  const active = Math.min(highlight, Math.max(suggestions.length - 1, 0));

  const length = text.length;
  const tooLong = length > MAX_MESSAGE_LENGTH;
  const canSend = text.trim().length > 0 && !tooLong && !sending;

  const update = (next: string, nextCaret: number) => {
    setText(next);
    setCaret(nextCaret);
    onDraftChange(next);
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    update(event.target.value, event.target.selectionStart);
    setHighlight(0);
    // Typing again reopens a list that Escape closed
    setDismissedAt(null);
    if (event.target.value.trim()) onTyping();
  };

  const syncCaret = (event: SyntheticEvent<HTMLTextAreaElement>) => setCaret(event.currentTarget.selectionStart);

  const choose = (member: ChatMember) => {
    if (!mention) return;
    const result = insertMention(text, mention, caret, member.name);
    update(result.text, result.caret);
    // The caret moves after React has written the new value
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(result.caret, result.caret);
    });
  };

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(text.trim());
      update('', 0);
    } catch (error) {
      // The text stays in the box so nothing is lost
      toast.error(getApiErrorMessage(error, t('composer.sendFailed')));
    } finally {
      setSending(false);
      field.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (listOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlight((active + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((active - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        choose(suggestions[active]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissedAt(mention?.start ?? null);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={event => { event.preventDefault(); void submit(); }}
      className="relative shrink-0 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5"
    >
      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('composer.mentionList')}
          className="absolute inset-x-3 bottom-full z-(--z-overlay) mb-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-floating sm:inset-x-5 sm:max-w-sm"
        >
          {suggestions.map((member, index) => (
            <li
              key={member._id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Pointer down, not click: the textarea must not lose focus first
              onMouseDown={event => { event.preventDefault(); choose(member); }}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800',
                index === active && 'bg-info-bg text-info-fg',
              )}
            >
              <ChatAvatar name={member.name} src={member.avatarUrl} size="sm" />
              <span className="truncate">{member.name}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${listId}-field`} className="sr-only">{t('composer.label', { channel: channelName })}</label>
          <Textarea
            id={`${listId}-field`}
            ref={field}
            value={text}
            rows={1}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onSelect={syncCaret}
            placeholder={t('composer.placeholder', { channel: channelName })}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={listOpen ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            aria-invalid={tooLong || undefined}
            aria-describedby={`${listId}-hint`}
            className="max-h-40 min-h-10 resize-none bg-white"
          />
        </div>
        <Button type="submit" disabled={!canSend} className="h-10 shrink-0 gap-1.5 px-3" aria-label={t('composer.send')}>
          <SendHorizontal className="rtl:-scale-x-100" aria-hidden />
          <span className="hidden sm:inline">{t('composer.send')}</span>
        </Button>
      </div>

      <div id={`${listId}-hint`} className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span className="hidden sm:inline">{t('composer.hint')}</span>
        {length >= COUNTER_FROM && (
          <span className={cn('ms-auto tabular-nums', tooLong && 'font-semibold text-danger-fg')} aria-live="polite">
            {tooLong ? t('composer.tooLong', { over: length - MAX_MESSAGE_LENGTH }) : t('composer.counter', { length, max: MAX_MESSAGE_LENGTH })}
          </span>
        )}
      </div>
    </form>
  );
};

export default Composer;
