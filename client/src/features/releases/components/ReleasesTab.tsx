import { useMemo, useState } from 'react';
import { ChevronDown, Plus, Rocket } from 'lucide-react';
import { Alert, EmptyState, SkeletonCards, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useReleases } from '../hooks/useReleases';
import { useReleaseStatus } from '../hooks/useReleaseStatus';
import ReleaseCard from './ReleaseCard';
import ReleaseDialogs, { type ReleaseDialogState } from './ReleaseDialogs';

interface ReleasesTabProps {
  workspaceSlug: string;
  projectId: string;
  /** Holds `projects:write`. */
  canManage: boolean;
  /** Called after a release was released or deleted: it moved tasks on the server, so tasks should reload. */
  onTasksChanged?: () => void;
}

/** The Releases tab of a project: unreleased versions first, then released and archived ones. */
const ReleasesTab = ({ workspaceSlug, projectId, canManage, onTasksChanged }: ReleasesTabProps) => {
  const { releases, loading, error, create, update, remove, release } = useReleases(workspaceSlug);
  const [dialog, setDialog] = useState<ReleaseDialogState>(null);
  const [showArchived, setShowArchived] = useState(false);
  const status = useReleaseStatus(update);

  const own = useMemo(() => releases.filter(item => item.project === projectId), [releases, projectId]);
  const upcoming = own.filter(item => item.status === 'unreleased');
  const released = own.filter(item => item.status === 'released');
  const archived = own.filter(item => item.status === 'archived');

  const renderCard = (item: (typeof own)[number]) => (
    <ReleaseCard
      key={item._id}
      release={item}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      canManage={canManage}
      busy={status.busyId === item._id}
      onEdit={target => setDialog({ kind: 'edit', release: target })}
      onRelease={target => setDialog({ kind: 'release', release: target })}
      onArchive={target => { void status.archive(target); }}
      onReopen={target => { void status.reopen(target); }}
      onDelete={target => setDialog({ kind: 'delete', release: target })}
    />
  );

  if (loading) return <SkeletonCards count={2} columns="grid-cols-1" className="gap-3" />;

  return (
    <div className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      {canManage && own.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({ kind: 'create' })} className="h-11 w-full gap-2 rounded-lg bg-primary text-sm text-white hover:bg-primary-hover sm:h-9 sm:w-fit">
            <Plus className="size-4" aria-hidden /> New release
          </Button>
        </div>
      )}

      {own.length === 0 ? (
        <Surface padding="none">
          <EmptyState
            icon={<Rocket />}
            title="No releases yet"
            description={canManage
              ? 'Plan a version, assign tasks to it and release it when the work is done. Release notes are written for you.'
              : 'Releases will show up here once someone plans them.'}
            action={canManage ? (
              <Button onClick={() => setDialog({ kind: 'create' })} className="h-10 gap-2 rounded-lg bg-primary text-sm text-white hover:bg-primary-hover">
                <Plus className="size-4" aria-hidden /> New release
              </Button>
            ) : undefined}
          />
        </Surface>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section aria-labelledby="unreleased-releases" className="space-y-3">
              <h2 id="unreleased-releases" className="text-sm font-semibold text-slate-900">Unreleased</h2>
              {upcoming.map(renderCard)}
            </section>
          )}
          {upcoming.length === 0 && <Alert tone="info">Every release of this project is released or archived.</Alert>}
          {released.length > 0 && (
            <section aria-labelledby="released-releases" className="space-y-3">
              <h2 id="released-releases" className="text-sm font-semibold text-slate-900">Released</h2>
              {released.map(renderCard)}
            </section>
          )}
          {archived.length > 0 && (
            <section aria-labelledby="archived-releases" className="space-y-3">
              <h2 id="archived-releases" className="text-sm font-semibold text-slate-900">
                <button
                  type="button"
                  onClick={() => setShowArchived(open => !open)}
                  aria-expanded={showArchived}
                  aria-controls="archived-release-list"
                  className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary md:min-h-9"
                >
                  <ChevronDown aria-hidden className={cn('size-4 text-slate-500 transition-transform motion-reduce:transition-none', !showArchived && '-rotate-90')} />
                  Archived
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-medium tabular-nums text-slate-600">{archived.length}</span>
                </button>
              </h2>
              {showArchived && <div id="archived-release-list" className="space-y-3">{archived.map(renderCard)}</div>}
            </section>
          )}
        </>
      )}

      <ReleaseDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        projectId={projectId}
        releases={releases}
        actions={{ create, update, remove, release }}
        onDone={kind => { if (kind === 'release' || kind === 'delete') onTasksChanged?.(); }}
      />
    </div>
  );
};

export default ReleasesTab;
