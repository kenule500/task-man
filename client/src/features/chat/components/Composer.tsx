import { useRef, useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import api, { getApiErrorMessage } from '@/utils/api';
import { cn } from '@/lib/utils';
import { activeMention, applyMention, mentionedUserIds } from '../lib/mentions';
import type { ChatAttachment, ChatUser } from '../types';

const MAX_MENTION_SUGGESTIONS = 6;

interface ComposerProps {
  slug: string;
  channelId: string;
  members: ChatUser[];
  /** The signed-in user, excluded from the mention menu. */
  currentUserId: string | undefined;
  disabled: boolean;
  disabledReason?: string;
  placeholder: string;
  /** Sends the message; the parent decides whether it goes over the socket or REST. */
  onSend: (body: string, options: { parentId?: string | null; mentionIds: string[]; attachmentIds: string[] }) => Promise<void>;
  parentId?: string | null;
  /** Composing events, so others see a typing indicator. */
  onTyping?: () => void;
  autoFocus?: boolean;
}

/** Message composer: text, @mentions with a keyboard menu, and file attachments. */
export const Composer = ({
  slug, channelId, members, currentUserId, disabled, disabledReason, placeholder,
  onSend, parentId, onTyping, autoFocus,
}: ComposerProps) => {
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [mention, setMention] = useState<{ start: number; end: number; term: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const suggestions = mention
    ? members
      // You cannot mention yourself, so you never appear in your own suggestion list (spec AC-049)
      .filter(member => member._id !== currentUserId)
      .filter(member => member.name.toLowerCase().includes(mention.term.toLowerCase()))
      .slice(0, MAX_MENTION_SUGGESTIONS)
    : [];

  const syncMention = (value: string, caret: number) => {
    setMention(activeMention(value, caret));
  };

  const pickMention = (user: ChatUser) => {
    if (!mention) return;
    const next = applyMention(body, mention, user.name);
    setBody(next.text);
    setMention(null);
    requestAnimationFrame(() => {
      const field = textareaRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(next.caret, next.caret);
    });
  };

  const submit = async () => {
    const text = body.trim();
    if ((!text && attachments.length === 0) || disabled || sending) return;
    setSending(true);
    setError('');
    try {
      await onSend(text, {
        parentId: parentId ?? null,
        mentionIds: mentionedUserIds(text, members),
        attachmentIds: attachments.map(item => item.id),
      });
      setBody('');
      setAttachments([]);
      setMention(null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send the message.'));
    } finally {
      setSending(false);
    }
  };

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    // Several files may be chosen at once; each is uploaded separately so one rejection does not
    // discard the rest (spec AC-053)
    for (const file of files) {
      try {
        const form = new FormData();
        form.append('file', file);
        const { data } = await api.post(
          `/workspaces/${encodeURIComponent(slug)}/chat/${channelId}/attachments`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        if (data?.attachment) setAttachments(current => [...current, data.attachment as ChatAttachment]);
      } catch (err) {
        setError(getApiErrorMessage(err, `Could not upload ${file.name}.`));
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      {error && <p role="alert" className="mb-2 text-xs text-danger-fg">{error}</p>}

      {attachments.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {attachments.map(attachment => (
            <li key={attachment.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
              <Paperclip className="size-3" aria-hidden />
              <span className="max-w-40 truncate">{attachment.name}</span>
              <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                onClick={() => setAttachments(current => current.filter(item => item.id !== attachment.id))}
                className="rounded p-0.5 outline-none hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        {suggestions.length > 0 && (
          <ul
            role="listbox"
            aria-label="Mention a teammate"
            className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            {suggestions.map(user => (
              <li key={user._id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => pickMention(user)}
                  className="w-full px-3 py-1.5 text-left text-sm outline-none hover:bg-slate-100 focus-visible:bg-slate-100"
                >
                  {user.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={textareaRef}
            value={body}
            autoFocus={autoFocus}
            disabled={disabled}
            rows={1}
            aria-label="Message"
            placeholder={disabled ? (disabledReason ?? 'You cannot post here') : placeholder}
            onChange={event => {
              setBody(event.target.value);
              syncMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
              onTyping?.();
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
              if (event.key === 'Escape' && mention) {
                event.preventDefault();
                setMention(null);
              }
            }}
            className={cn(
              'min-h-10 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none',
              'focus-visible:outline-2 focus-visible:outline-primary disabled:bg-slate-50 disabled:text-slate-400',
            )}
          />

          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={event => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void upload(files);
            }}
          />
          <button
            type="button"
            disabled={disabled || uploading}
            aria-label="Attach files"
            onClick={() => fileRef.current?.click()}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          >
            <Paperclip className="size-4" aria-hidden />
          </button>
          <button
            type="submit"
            disabled={disabled || sending || (!body.trim() && attachments.length === 0)}
            aria-label="Send message"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white outline-none hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Enter sends · Shift+Enter adds a line · @ mentions a teammate</p>
    </div>
  );
};

export default Composer;
