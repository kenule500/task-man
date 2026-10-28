import { useEffect, useRef, useState } from 'react';
import { Image, Paperclip, Send, X } from 'lucide-react';
import api, { getApiErrorMessage } from '@/utils/api';
import { cn } from '@/lib/utils';
import { detectSnippet, fenceOf } from '../lib/code';
import { humanSize, kindOf } from '../lib/attachments';
import { activeMention, applyMention, mentionedUserIds } from '../lib/mentions';
import type { ChatAttachment, ChatUser } from '../types';

const MAX_MENTION_SUGGESTIONS = 6;

/** An uploaded attachment plus the local file still in memory, used to preview it before sending. */
interface PendingAttachmentItem {
  attachment: ChatAttachment;
  /** Object URL of the local file; revoked when the row goes away (FR-088). */
  previewUrl: string | null;
}

/**
 * One attachment that has been uploaded but not yet sent, previewed the way it will appear in the
 * message: a thumbnail for an image, a chip for anything else (FR-088, AC-091).
 */
const PendingAttachment = ({
  item, onRemove,
}: {
  item: PendingAttachmentItem;
  onRemove: () => void;
}) => {
  const { attachment, previewUrl } = item;
  const isImage = kindOf(attachment.type) === 'image';
  const size = humanSize(attachment.size);

  const remove = (
    <button
      type="button"
      aria-label={`Remove ${attachment.name}`}
      onClick={onRemove}
      className="rounded p-0.5 text-slate-500 outline-none hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <X className="size-3" aria-hidden />
    </button>
  );

  return (
    <li className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 pr-2">
      {isImage && previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          className="size-9 shrink-0 rounded object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400"
        >
          {isImage ? <Image className="size-4" /> : <Paperclip className="size-4" />}
        </span>
      )}
      <span className="min-w-0">
        <span className="block max-w-40 truncate text-xs font-medium text-slate-700">{attachment.name}</span>
        <span className="block text-[11px] text-slate-400">
          {[isImage ? 'Image' : 'File', size].filter(Boolean).join(' · ')}
        </span>
      </span>
      {remove}
    </li>
  );
};

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
  const [attachments, setAttachments] = useState<PendingAttachmentItem[]>([]);
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

  /**
   * A pasted snippet becomes a fenced block tagged with its language, inserted at the caret so it
   * keeps the pasted indentation and any text already typed around it (FR-080, AC-083).
   *
   * Only code gets this treatment: prose that merely wraps stays prose (EC-035), and a paste that
   * already carries a fence is left exactly as it is (EC-034).
   */
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    if (!pasted || !detectSnippet(pasted)) return;

    event.preventDefault();
    const field = event.currentTarget;
    const start = field.selectionStart ?? body.length;
    const end = field.selectionEnd ?? start;
    const before = body.slice(0, start);
    const after = body.slice(end);

    // Keep the block on its own lines without adding a leading empty line when there is no text yet
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const suffix = after && !after.startsWith('\n') ? '\n' : '';
    const inserted = `${prefix}${fenceOf(pasted)}${suffix}`;
    const next = `${before}${inserted}${after}`;
    const caret = before.length + inserted.length;

    setBody(next);
    syncMention(next, caret);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
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
        attachmentIds: attachments.map(item => item.attachment.id),
      });
      setBody('');
      // Sending ends the previews: each object URL is revoked with its row
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
        if (data?.attachment) {
          const attachment = data.attachment as ChatAttachment;
          // An image keeps a local object URL so it can be previewed before it is sent (FR-088)
          const previewUrl = kindOf(attachment.type) === 'image' ? URL.createObjectURL(file) : null;
          setAttachments(current => [...current, { attachment, previewUrl }]);
        }
      } catch (err) {
        setError(getApiErrorMessage(err, `Could not upload ${file.name}.`));
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  /** Removing a pending attachment also releases the object URL it was previewed with (AC-091). */
  const removeAttachment = (attachmentId: string) => {
    setAttachments(current => current.filter(item => {
      if (item.attachment.id !== attachmentId) return true;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return false;
    }));
  };

  // Nothing outlives the composer: a URL still held when the channel changes is revoked on unmount
  const previewsRef = useRef(attachments);
  useEffect(() => { previewsRef.current = attachments; }, [attachments]);
  useEffect(() => () => {
    for (const item of previewsRef.current) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
  }, []);

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      {error && <p role="alert" className="mb-2 text-xs text-danger-fg">{error}</p>}

      {attachments.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {attachments.map(item => (
            <PendingAttachment
              key={item.attachment.id}
              item={item}
              onRemove={() => removeAttachment(item.attachment.id)}
            />
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
            data-chat-composer
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
            onPaste={handlePaste}
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
