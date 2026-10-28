import { useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LightboxProps {
  /** Object URL of the full image, or null while it is still loading. */
  src: string | null;
  /** The attachment name, used as the dialog title and the download filename. */
  name: string;
  /** Secondary line under the title. */
  detail?: string;
  onClose: () => void;
  onDownload?: () => void;
  /** The thumbnail that opened it, so focus can go back where it came from (AC-099). */
  returnFocusTo?: HTMLElement | null;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The in-app image viewer (FR-085, AC-088).
 *
 * Modal and keyboard-complete: focus moves inside on open, Tab cycles within the dialog, Escape and a
 * click on the scrim close it, and focus returns to the thumbnail afterwards. It exists so an image is
 * never opened by navigating the browser at the protected API route, which has no bearer token
 * (NFR-033, NFR-039).
 */
export const Lightbox = ({
  src, name, detail, onClose, onDownload, returnFocusTo,
}: LightboxProps) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Read once: the ref is only used to hand focus back after the dialog is gone
  const openerRef = useRef<HTMLElement | null>(returnFocusTo ?? null);

  useEffect(() => {
    const previous = openerRef.current ?? (document.activeElement as HTMLElement | null);
    // The close control, not the image, is where a keyboard user lands: it is always present
    closeRef.current?.focus();

    return () => {
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Trap: Tab from the last control goes to the first, Shift+Tab from the first to the last
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(element => element.offsetParent !== null || element === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // The scrim is the backdrop itself: a click that did not start on the dialog's content closes
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/80 p-3 sm:p-6"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-lightbox-title"
        className="flex max-h-full w-full max-w-3xl flex-col items-center gap-2"
      >
        <div className="flex w-full items-center justify-between gap-2 text-white">
          <div className="min-w-0">
            <h2 id="chat-lightbox-title" className="truncate text-sm font-semibold">{name}</h2>
            {detail && <p className="truncate text-xs text-slate-300">{detail}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                aria-label={`Download ${name}`}
                className="flex size-9 items-center justify-center rounded-md text-slate-200 outline-none hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
              >
                <Download className="size-4" aria-hidden />
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close image"
              className="flex size-9 items-center justify-center rounded-md text-slate-200 outline-none hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className={cn('flex w-full flex-1 items-center justify-center overflow-hidden')}>
          {src ? (
            <img
              src={src}
              alt={name}
              className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
            />
          ) : (
            // The bytes may still be in flight or may have failed; either way the dialog stays usable
            <p className="py-10 text-sm text-slate-300">Loading image...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Lightbox;