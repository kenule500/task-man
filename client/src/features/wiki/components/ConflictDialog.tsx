import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatRelativeTime } from '@/features/tasks/lib/date';
import type { WikiPage } from '../types';

interface ConflictDialogProps {
  /** The latest saved page, as the server has it now. Null closes the dialog. */
  theirs: WikiPage | null;
  mine: { title: string; content: string };
  busy: boolean;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  onClose: () => void;
}

const PREVIEW_LIMIT = 6000;

const Version = ({ heading, title, content }: { heading: string; title: string; content: string }) => (
  <section aria-label={heading} className="min-w-0 space-y-1.5">
    <h3 className="text-sm font-semibold text-text-strong">{heading}</h3>
    <div className="rounded-lg border border-slate-200 bg-surface-sunken p-3">
      <p className="text-sm font-medium break-words text-text-strong">{title}</p>
      <pre tabIndex={0} className="mt-2 max-h-56 overflow-auto font-mono text-xs leading-5 break-words whitespace-pre-wrap text-text-body outline-none focus-visible:outline-2 focus-visible:outline-focus">
        {content.length > PREVIEW_LIMIT ? `${content.slice(0, PREVIEW_LIMIT)}\n…` : content || '(empty)'}
      </pre>
    </div>
  </section>
);

/** Shown when someone else saved first: compare both versions, then keep yours or take theirs. */
const ConflictDialog = ({ theirs, mine, busy, onKeepMine, onTakeTheirs, onClose }: ConflictDialogProps) => (
  <Dialog open={theirs !== null} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border border-slate-200 bg-white p-0 shadow-2xl sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-xl">
      <DialogHeader className="space-y-1 border-b border-slate-200 px-4 py-4 pr-12 sm:px-6">
        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-text-strong">
          <TriangleAlert aria-hidden className="size-5 text-warning-fg" /> Someone else changed this page
        </DialogTitle>
        <DialogDescription className="text-sm text-text-body">
          {theirs?.updatedBy?.name ?? 'A teammate'} saved a newer version {theirs ? formatRelativeTime(theirs.updatedAt) : ''} while you were editing.
          Keep yours to replace theirs (it stays in the page history), or take theirs and discard your changes.
        </DialogDescription>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 sm:grid-cols-2 sm:px-6">
        {theirs && <Version heading="Their version" title={theirs.title} content={theirs.content} />}
        <Version heading="Your version" title={mine.title} content={mine.content} />
      </div>

      <DialogFooter className="m-0 flex flex-row flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 [&>button]:flex-1 sm:[&>button]:flex-none">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="h-11 sm:h-9">Keep editing</Button>
        <Button type="button" variant="outline" onClick={onTakeTheirs} disabled={busy} className="h-11 sm:h-9">Take theirs</Button>
        <Button type="button" onClick={onKeepMine} disabled={busy} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-9">
          {busy ? 'Saving' : 'Keep mine'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default ConflictDialog;
