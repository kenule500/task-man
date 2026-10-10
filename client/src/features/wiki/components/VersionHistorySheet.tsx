import { useEffect, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { Alert, SkeletonList, Spinner, UserAvatar, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatRelativeTime } from '@/features/tasks/lib/date';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/utils/api';
import { wikiApi } from '../api';
import type { WikiPage, WikiVersion, WikiVersionList } from '../types';
import MarkdownView from './MarkdownView';

interface VersionHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  page: WikiPage;
  canRestore: boolean;
  /** Called with the page after a restore (it becomes the new current version). */
  onRestored: (page: WikiPage) => void;
}

interface Loaded {
  key: string;
  list: WikiVersionList | null;
  error: string;
}

interface Preview {
  key: string;
  version: WikiVersion | null;
  error: string;
}

/** The earlier versions of a page (the last 20): preview any of them and restore it as a new version. */
const VersionHistorySheet = ({ open, onOpenChange, workspaceSlug, page, canRestore, onRestored }: VersionHistorySheetProps) => {
  const listKey = `${page._id}:${page.version}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    wikiApi.versions(workspaceSlug, page._id)
      .then(list => { if (!cancelled) setLoaded({ key: listKey, list, error: '' }); })
      .catch(err => {
        if (!cancelled) setLoaded({ key: listKey, list: null, error: getApiErrorMessage(err, 'We could not load the history. Try again.') });
      });
    return () => { cancelled = true; };
  }, [open, listKey, workspaceSlug, page._id]);

  const previewKey = selected === null ? '' : `${page._id}:${selected}`;
  useEffect(() => {
    if (!open || selected === null) return;
    let cancelled = false;
    wikiApi.version(workspaceSlug, page._id, selected)
      .then(version => { if (!cancelled) setPreview({ key: previewKey, version, error: '' }); })
      .catch(err => {
        if (!cancelled) setPreview({ key: previewKey, version: null, error: getApiErrorMessage(err, 'We could not load that version. Try again.') });
      });
    return () => { cancelled = true; };
  }, [open, selected, previewKey, workspaceSlug, page._id]);

  const current = loaded?.key === listKey ? loaded : null;
  const shown = preview?.key === previewKey ? preview : null;

  const restore = async () => {
    if (selected === null || restoring) return;
    setRestoring(true);
    try {
      const restored = await wikiApi.restore(workspaceSlug, page._id, selected);
      toast.success(`Restored version ${selected}`);
      setSelected(null);
      onRestored(restored);
      onOpenChange(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'We could not restore that version. Try again.'));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={next => { onOpenChange(next); if (!next) setSelected(null); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden sm:max-w-xl">
        <SheetHeader className="border-b border-slate-200 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base font-bold text-text-strong"><History aria-hidden className="size-4" /> Page history</SheetTitle>
          <SheetDescription className="text-sm text-text-body">The last 20 versions are kept. Restoring one saves it as a new version.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {current?.error && <Alert tone="error">{current.error}</Alert>}
          {!current && <SkeletonList label="Loading history" rows={4} avatar={false} trailing={false} bare />}

          {current?.list && (
            <ul aria-label="Versions" className="space-y-1">
              <li className="rounded-lg bg-surface-sunken px-3 py-2 text-sm">
                <span className="font-medium text-text-strong">Version {current.list.current} (current)</span>
                <span className="block text-xs text-text-subtle">
                  {page.updatedBy?.name ?? 'Unknown'} · {formatRelativeTime(page.updatedAt)}
                </span>
              </li>
              {current.list.versions.map(item => (
                <li key={item.version}>
                  <button
                    type="button"
                    aria-pressed={selected === item.version}
                    onClick={() => setSelected(item.version)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus',
                      selected === item.version && 'bg-info-bg',
                    )}
                  >
                    <UserAvatar name={item.editedBy?.name ?? '?'} src={item.editedBy?.avatarUrl || undefined} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-text-strong">Version {item.version}: {item.title}</span>
                      <span className="block text-xs text-text-subtle">{item.editedBy?.name ?? 'Unknown'} · {formatRelativeTime(item.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {current.list.versions.length === 0 && <li className="px-3 py-2 text-sm text-text-subtle">No earlier versions yet. They appear after the first edit.</li>}
            </ul>
          )}

          {selected !== null && (
            <section aria-label={`Version ${selected}`} className="space-y-3 rounded-xl border border-slate-200 p-4">
              {shown?.error && <Alert tone="error">{shown.error}</Alert>}
              {!shown && <p role="status" className="flex items-center gap-2 text-sm text-text-subtle"><Spinner decorative /> Loading version</p>}
              {shown?.version && (
                <>
                  <h3 className="text-lg font-semibold break-words text-text-strong">{shown.version.title}</h3>
                  {shown.version.content.trim()
                    ? <MarkdownView source={shown.version.content} workspaceSlug={workspaceSlug} />
                    : <p className="text-sm text-text-subtle">This version was empty.</p>}
                  {canRestore && (
                    <Button type="button" onClick={() => { void restore(); }} disabled={restoring} className="h-11 gap-1.5 bg-primary text-white hover:bg-primary-hover md:h-9">
                      {restoring ? <Spinner decorative /> : <RotateCcw aria-hidden />} Restore this version
                    </Button>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default VersionHistorySheet;
