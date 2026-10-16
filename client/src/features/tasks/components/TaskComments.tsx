import { useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SectionHeader, UserAvatar, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  activeMention, filterMentionCandidates, insertMention, splitMentions,
  type MentionCandidate,
} from '@/features/notifications/lib/mentions';
import { useProjectDirectory } from '@/features/projects';
import { cn } from 'cn';
import { getApiErrorMessage } from '../api';
import { useWorkspaceMembers } from '../hooks/useWorkspaceMembers';
import { formatRelativeTime } from '../lib/date';
import type { TaskComment } from '../types';
import { currentLocale } from '@/i18n/format';

const MAX_COMMENT_LENGTH = 2000;
const LISTBOX_ID = 'task-comment-mentions';
const NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'];

export interface TaskCommentsProps {
  comments: TaskComment[];
  currentUserId?: string;
  /** Adding and deleting comments needs `tasks:write`. */
  canWrite: boolean;
  onAdd: (text: string) => Promise<void>;
  onRemove: (commentId: string) => Promise<void>;
  /** People the "@" list suggests; defaults to the members of the current workspace. */
  members?: MentionCandidate[];
}

/** A comment's text with its "@Name" mentions highlighted. */
const CommentText = ({ text, names }: { text: string; names: string[] }) => {
  const segments = splitMentions(text, names);
  if (segments.length === 1 && !segments[0].mention) return <>{text}</>;
  return (
    <>
      {segments.map((segment, index) => segment.mention
        ? <span key={index} className="rounded bg-blue-50 px-0.5 font-medium text-blue-800">{segment.text}</span>
        : <span key={index}>{segment.text}</span>)}
    </>
  );
};

const TaskComments = ({ comments, currentUserId, canWrite, onAdd, onRemove, members: providedMembers }: TaskCommentsProps) => {
  const { t } = useTranslation('tasks');
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const trimmed = text.trim();

  const directory = useProjectDirectory();
  const fetched = useWorkspaceMembers(directory.slug || undefined, canWrite && !providedMembers);
  const candidates: MentionCandidate[] = useMemo(
    () => (providedMembers ?? fetched.members).filter(member => member._id !== currentUserId),
    [providedMembers, fetched.members, currentUserId],
  );
  // Names used to highlight mentions: members when known, plus everyone who commented
  const knownNames = useMemo(() => [
    ...new Set([
      ...candidates.map(member => member.name),
      ...comments.map(comment => comment.author?.name).filter((name): name is string => Boolean(name)),
    ]),
  ], [candidates, comments]);

  const mention = activeMention(text, caret);
  const suggestions = mention && dismissedAt !== mention.start ? filterMentionCandidates(candidates, mention.query) : [];
  const listOpen = canWrite && suggestions.length > 0;
  const activeOption = listOpen ? Math.min(activeIndex, suggestions.length - 1) : -1;
  const optionId = (index: number) => `${LISTBOX_ID}-${index}`;

  // Put the caret after an inserted name once React has rendered the new text
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !textarea.current) return;
    textarea.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const syncCaret = (event: SyntheticEvent<HTMLTextAreaElement>) => setCaret(event.currentTarget.selectionStart ?? 0);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    setCaret(event.target.selectionStart ?? event.target.value.length);
    setActiveIndex(0);
    setDismissedAt(null);
  };

  const choose = (member: MentionCandidate) => {
    if (!mention) return;
    const next = insertMention(text, mention, caret, member.name);
    pendingCaret.current = next.caret;
    setText(next.text);
    setCaret(next.caret);
    setActiveIndex(0);
    textarea.current?.focus();
  };

  const post = async () => {
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      await onAdd(trimmed);
      setText('');
      setCaret(0);
      toast.success(t('comments.added'));
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('comments.addError')));
    } finally {
      setPosting(false);
    }
  };

  const remove = async (comment: TaskComment) => {
    setRemovingId(comment._id);
    try {
      await onRemove(comment._id);
      toast.success(t('comments.deleted'));
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('comments.deleteError')));
    } finally {
      setRemovingId(null);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (listOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((activeOption + step + suggestions.length) % suggestions.length);
        return;
      }
      if ((event.key === 'Enter' && !event.ctrlKey && !event.metaKey) || event.key === 'Tab') {
        event.preventDefault();
        choose(suggestions[activeOption]);
        return;
      }
      if (event.key === 'Escape' && mention) {
        // Closes the list only, not the dialog the comment box lives in
        event.preventDefault();
        event.stopPropagation();
        setDismissedAt(mention.start);
        return;
      }
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void post();
    }
  };

  return (
    <section aria-label={t('comments.title')}>
      <SectionHeader title={t('comments.title')} count={comments.length} icon={<MessageSquare className="size-4 text-slate-500" aria-hidden />} className="mb-2" />

      {comments.length === 0 ? (
        <p className="text-sm text-slate-500">{t('comments.none')}</p>
      ) : (
        <ul className="space-y-4">
          {comments.map(comment => {
            const own = canWrite && Boolean(currentUserId) && comment.author?._id === currentUserId;
            return (
              <li key={comment._id} className="flex items-start gap-3">
                <UserAvatar name={comment.author?.name || t('comments.unknown')} src={comment.author?.avatarUrl || undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium text-slate-800">{comment.author?.name || t('comments.unknown')}</span>
                    <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString(currentLocale())} className="text-xs text-slate-500">
                      {formatRelativeTime(comment.createdAt)}
                    </time>
                  </p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-slate-700 [overflow-wrap:anywhere]">
                    <CommentText text={comment.text} names={knownNames} />
                  </p>
                </div>
                {own && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('comments.delete')}
                    disabled={removingId === comment._id}
                    onClick={() => void remove(comment)}
                    className="size-10 shrink-0 text-slate-500 hover:bg-danger-bg hover:text-danger-fg sm:size-8"
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && (
        <div className="mt-4 space-y-2">
          <label htmlFor="task-comment" className="sr-only">{t('comments.addLabel')}</label>
          <div className="relative">
            {listOpen && (
              <ul
                id={LISTBOX_ID}
                role="listbox"
                aria-label={t('comments.mentionList')}
                className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                {suggestions.map((member, index) => (
                  <li
                    key={member._id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeOption}
                    // Keep the focus in the text box while choosing
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => choose(member)}
                    onMouseMove={() => setActiveIndex(index)}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm text-slate-800',
                      index === activeOption && 'bg-blue-50',
                    )}
                  >
                    <span aria-hidden className="contents"><UserAvatar name={member.name} src={member.avatarUrl || undefined} size="sm" /></span>
                    <span className="truncate">{member.name}</span>
                  </li>
                ))}
              </ul>
            )}
            <Textarea
              ref={textarea}
              id="task-comment"
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onKeyUp={event => { if (!NAVIGATION_KEYS.includes(event.key)) syncCaret(event); }}
              onClick={syncCaret}
              onSelect={syncCaret}
              aria-controls={listOpen ? LISTBOX_ID : undefined}
              aria-activedescendant={listOpen ? optionId(activeOption) : undefined}
              aria-autocomplete="list"
              placeholder={t('comments.placeholder')}
              maxLength={MAX_COMMENT_LENGTH}
              rows={2}
              className="min-h-16 rounded-lg border border-slate-300 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-0 sm:text-sm"
            />
          </div>
          <p role="status" className="sr-only">
            {listOpen ? t('comments.mentionStatus', { count: suggestions.length }) : ''}
          </p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">{t('comments.sendHint')}</p>
            <Button
              type="button"
              disabled={!trimmed || posting}
              onClick={() => void post()}
              className="h-10 gap-1.5 bg-primary text-white hover:bg-primary-hover sm:h-9"
            >
              <Send className="size-4" aria-hidden /> {posting ? t('comments.sending') : t('comments.send')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default TaskComments;
