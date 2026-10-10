import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard } from 'lucide-react';
import { Kbd } from '@/components/ds';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/usePermissions';
import {
  GO_SEQUENCE_MS, GO_TARGETS, OPEN_SHORTCUTS_EVENT, isOverlayOpen, isTextEntryTarget, shortcutGroups,
} from './shortcuts';

interface KeyboardShortcutsProps {
  /** Workspace the shortcuts navigate within. */
  slug: string;
}

/** Opens the app's search the way Ctrl+K does (the sidebar listens for it). */
const openSearchPalette = () =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));

/**
 * Global, Linear-style shortcuts: `c` new task, `/` search, `g` then `d|t|p|b|c|r` to jump to a page, `?` for the list.
 * Nothing fires while typing in a field, while a dialog or menu is open, or with Ctrl/Cmd/Alt held.
 * Shortcuts respect permissions: no `c` without tasks:write, no `g r` without reports:read.
 */
const KeyboardShortcuts = ({ slug }: KeyboardShortcutsProps) => {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [helpOpen, setHelpOpen] = useState(false);

  // The handler reads the latest values without re-subscribing (and without losing a half-typed `g` sequence)
  const latest = useRef({ slug, can, navigate });
  useEffect(() => {
    latest.current = { slug, can, navigate };
  });

  useEffect(() => {
    let goTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelGo = () => {
      if (goTimer !== undefined) clearTimeout(goTimer);
      goTimer = undefined;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEntryTarget(event.target) || isOverlayOpen()) {
        cancelGo();
        return;
      }
      const { slug: currentSlug, can: canDo, navigate: go } = latest.current;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      // Second key of `g` + letter
      if (goTimer !== undefined) {
        cancelGo();
        const target = event.shiftKey ? undefined : GO_TARGETS.find(item => item.key === key);
        if (target) {
          // Claim the key so page-level handlers (the calendar's "t") do not also act on it
          event.preventDefault();
          if (!target.permission || canDo(target.permission)) go(target.path(currentSlug));
          return;
        }
      }
      if (event.repeat) return;

      if (key === 'g' && !event.shiftKey) {
        goTimer = setTimeout(cancelGo, GO_SEQUENCE_MS);
        return;
      }
      if (key === 'c' && !event.shiftKey) {
        if (!canDo('tasks:write')) return;
        event.preventDefault();
        go(`/${currentSlug}/tasks?new=1`);
        return;
      }
      if (key === '/') {
        event.preventDefault();
        const search = document.querySelector<HTMLInputElement>('input[aria-label="Search tasks"]');
        if (search) {
          search.focus();
          search.select();
        } else {
          openSearchPalette();
        }
        return;
      }
      if (key === '?') {
        event.preventDefault();
        setHelpOpen(true);
      }
    };

    const openHelp = () => setHelpOpen(true);
    // Capture phase: run before page-level handlers so a claimed key can be marked as handled
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
    return () => {
      cancelGo();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
    };
  }, []);

  return <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />;
};

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The "Keyboard shortcuts" reference, opened with `?`. */
const ShortcutsDialog = ({ open, onOpenChange }: ShortcutsDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85dvh] w-full max-w-full flex-col gap-0 overflow-hidden border border-slate-200 bg-white p-0 sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 pr-12 sm:px-6">
        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Keyboard className="size-5 text-primary" aria-hidden /> Keyboard shortcuts
        </DialogTitle>
        <DialogDescription className="text-sm text-slate-600">
          Shortcuts work anywhere in the workspace except while you type in a field. Pages you cannot open are skipped.
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        {shortcutGroups().map(group => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</h3>
            <ul className="divide-y divide-slate-100">
              {group.entries.map(entry => (
                <li key={entry.label} className="flex min-h-10 items-center justify-between gap-4 py-1.5">
                  <span className="text-sm text-slate-700">{entry.label}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                    {entry.keys.map((key, index) => (
                      <Fragment key={`${key}-${index}`}>
                        {index > 0 && entry.sequence && <span>then</span>}
                        <Kbd>{key}</Kbd>
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);

export default KeyboardShortcuts;
