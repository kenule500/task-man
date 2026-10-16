import { memo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTimeIn } from '@/i18n/format';
import { getApiErrorMessage } from '@/utils/api';
import { splitMentions } from '../lib/mentions';
import { MAX_MESSAGE_LENGTH } from '../lib/limits';
import type { ChatMember, ChatMessage } from '../types';
import ChatAvatar from './ChatAvatar';

interface MessageItemProps {
  message: ChatMessage;
  members: ChatMember[];
  own: boolean;
  /** First message of a run by the same author: shows the avatar, name and time */
  showHeader: boolean;
  onEdit: (id: string, text: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

const timeOf = (iso: string) => formatDateTimeIn(new Date(iso), { hour: 'numeric', minute: '2-digit' });
const fullTimeOf = (iso: string) => formatDateTimeIn(new Date(iso), { dateStyle: 'full', timeStyle: 'short' });

/** The text, with "@Name" of known members highlighted. Always rendered as text, never as HTML. */
const MessageText = ({ text, members }: { text: string; members: ChatMember[] }) => (
  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
    {splitMentions(text, members).map((segment, index) => (
      segment.mention
        ? <span key={index} className="rounded bg-info-bg px-0.5 font-medium text-info-fg">{segment.text}</span>
        : <span key={index}>{segment.text}</span>
    ))}
  </p>
);

const MessageItem = ({ message, members, own, showHeader, onEdit, onRemove }: MessageItemProps) => {
  const { t } = useTranslation('chat');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const startEdit = () => {
    setDraft(message.text);
    setEditing(true);
  };

  const save = async () => {
    const text = draft.trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH) return;
    if (text === message.text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEdit(message._id, text);
      setEditing(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('messages.editFailed')));
    } finally {
      setSaving(false);
    }
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setEditing(false);
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await onRemove(message._id);
      setConfirmDelete(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('messages.deleteFailed')));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <li className={`group/message relative flex gap-3 rounded-lg px-2 py-1 hover:bg-slate-50 focus-within:bg-slate-50 ${showHeader ? 'mt-3' : ''}`}>
      <div className="w-9 shrink-0">
        {showHeader && <ChatAvatar name={message.author.name} src={message.author.avatarUrl} />}
      </div>

      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-slate-900">{message.author.name}</span>
            <time dateTime={message.createdAt} title={fullTimeOf(message.createdAt)} className="text-xs tabular-nums text-slate-500">
              {timeOf(message.createdAt)}
            </time>
          </div>
        )}

        {editing ? (
          <div className="mt-1 space-y-2">
            <Textarea
              autoFocus
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={onEditKeyDown}
              aria-label={t('messages.editLabel')}
              className="max-h-48 min-h-16 bg-white"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !draft.trim() || draft.length > MAX_MESSAGE_LENGTH}>
                {saving ? t('messages.saving') : t('messages.save')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                {t('messages.cancel')}
              </Button>
              <span className="text-xs text-slate-500">{t('messages.editHint')}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <MessageText text={message.text} members={members} />
              {message.editedAt && (
                <span className="text-xs text-slate-500" title={fullTimeOf(message.editedAt)}>({t('messages.edited')})</span>
              )}
            </div>
            {!showHeader && (
              <time dateTime={message.createdAt} title={fullTimeOf(message.createdAt)} className="mt-0.5 hidden shrink-0 text-xs tabular-nums text-slate-500 group-hover/message:block group-focus-within/message:block">
                {timeOf(message.createdAt)}
              </time>
            )}
          </div>
        )}
      </div>

      {own && !editing && (
        <div className="absolute end-2 top-0 flex -translate-y-1/2 gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 opacity-100 shadow-sm md:opacity-0 md:group-hover/message:opacity-100 md:focus-within:opacity-100">
          <Button type="button" variant="ghost" size="icon-sm" onClick={startEdit} aria-label={t('messages.editAction', { name: message.author.name })} title={t('messages.edit')}>
            <Pencil aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} aria-label={t('messages.deleteAction', { name: message.author.name })} title={t('messages.delete')} className="text-danger-fg hover:bg-danger-bg hover:text-danger-fg">
            <Trash2 aria-hidden />
          </Button>
        </div>
      )}

      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('messages.deleteTitle')}
        description={t('messages.deleteDescription')}
        confirmLabel={t('messages.delete')}
        busyLabel={t('messages.deleting')}
        busy={deleting}
        onConfirm={() => void remove()}
      />
    </li>
  );
};

export default memo(MessageItem);
