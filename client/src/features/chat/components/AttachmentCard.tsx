import { lazy, Suspense, useRef, useState } from 'react';
import { AlertTriangle, FileText, ImageOff, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAttachmentUrl } from '../hooks/useAttachmentUrl';
import { downloadName, humanSize, kindOf } from '../lib/attachments';
import type { ChatAttachment } from '../types';

interface AttachmentCardProps {
  slug: string | undefined;
  attachment: ChatAttachment;
  /** The message is deleted or the caller is read-only; previews still work, actions stay the same. */
  className?: string;
}

/** Saves the fetched bytes under the attachment's own name, without navigating anywhere. */
const saveBlob = (url: string, name: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

/**
 * One attachment inside a message (FR-084, FR-085).
 *
 * An image renders as a bounded thumbnail that opens the lightbox; anything else renders as a file
 * card whose button downloads the bytes. Both are real `<button>`s with an accessible name that
 * includes the file name, and neither navigates the browser to the API route (AC-087, AC-088, NFR-033).
 *
 * The bytes come from `useAttachmentUrl`, so the fetch is authenticated once per attachment id and the
 * object URL is revoked when the last consumer goes away. A failed fetch is a readable, retryable
 * placeholder rather than a broken image or an auth error page (EC-037, NFR-041).
 */
export const AttachmentCard = ({ slug, attachment, className }: AttachmentCardProps) => {
  const isImage = kindOf(attachment.type) === 'image';
  const { url, loading, failed, retry } = useAttachmentUrl(slug, attachment.id, Boolean(slug));
  const [open, setOpen] = useState(false);
  // A stored `image/*` that the browser cannot decode falls back to the file card. Without this the
  // <img> onError handler would refetch and fail again forever (EC-037, NFR-041).
  const [undecodable, setUndecodable] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Read when the lightbox opens, never during render: a ref's `current` is not a render input
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  const size = humanSize(attachment.size);

  const openPreview = () => {
    setReturnTo(triggerRef.current);
    setOpen(true);
  };
  const download = () => {
    if (url) saveBlob(url, attachment.name);
    else retry();
  };

  if (failed) {
    return (
      <span
        className={cn(
          'mt-1 flex max-w-xs items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5',
          className,
        )}
      >
        <AlertTriangle className="size-4 shrink-0 text-warning-fg" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-slate-700">{attachment.name}</span>
          <span className="block text-[11px] text-slate-500">Could not load this attachment.</span>
        </span>
        <button
          type="button"
          onClick={retry}
          aria-label={`Retry loading ${attachment.name}`}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-primary outline-none hover:bg-white focus-visible:outline-2 focus-visible:outline-primary"
        >
          <RotateCw className="size-3" aria-hidden />
          Retry
        </button>
      </span>
    );
  }

  if (isImage && !undecodable) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={openPreview}
          aria-label={`Preview ${attachment.name}${size ? `, ${size}` : ''}`}
          className={cn(
            'mt-1 block max-w-[240px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left outline-none',
            'focus-visible:outline-2 focus-visible:outline-primary',
            className,
          )}
        >
          {url ? (
            <img
              src={url}
              alt={attachment.name}
              // A stored image/* that will not decode falls back to the file card's copy instead of a broken icon
              onError={() => setUndecodable(true)}
              className="max-h-40 w-full object-cover"
            />
          ) : (
            <span className="flex aspect-[4/3] w-40 items-center justify-center bg-slate-100 text-slate-400">
              {loading ? (
                <span className="text-[11px]">Loading...</span>
              ) : (
                <ImageOff className="size-5" aria-hidden />
              )}
            </span>
          )}
          <span className="block truncate px-2 py-1 text-[11px] text-slate-600">{attachment.name}</span>
        </button>

        {open && (
          <Suspense fallback={null}>
            <LightboxLazy
              src={url}
              name={attachment.name}
              detail={size}
              onClose={() => setOpen(false)}
              onDownload={url ? download : undefined}
              returnFocusTo={returnTo}
            />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={download}
      aria-label={`Download ${attachment.name}${size ? `, ${size}` : ''}`}
      className={cn(
        'mt-1 flex max-w-xs items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left outline-none',
        'hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary',
        className,
      )}
    >
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-slate-800">{attachment.name}</span>
        <span className="block text-[11px] text-slate-500">{loading ? 'Loading...' : size || 'Download'}</span>
      </span>
    </button>
  );
};

/** The lightbox is only needed once an image is opened, so it stays out of the initial chunk. */
const LightboxLazy = lazy(() => import('./Lightbox'));

export default AttachmentCard;