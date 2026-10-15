import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Archive, ArchiveRestore, CalendarDays, ListTodo, Pencil, RotateCcw, Rocket, Trash2 } from 'lucide-react';
import { ProgressBar, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { describeReleaseDue, describeReleaseProgress, formatReleaseDates, releasePercent } from '../lib/progress';
import type { Release } from '../types';
import ReleaseStatusTag from './ReleaseStatusTag';

interface ReleaseCardProps {
  release: Release;
  workspaceSlug: string;
  projectId: string;
  /** Holds `projects:write`: edit, release, archive and delete. */
  canManage: boolean;
  busy?: boolean;
  onEdit: (release: Release) => void;
  onRelease: (release: Release) => void;
  onArchive: (release: Release) => void;
  onReopen: (release: Release) => void;
  onDelete: (release: Release) => void;
}

const Meta = ({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1.5 text-xs tabular-nums text-slate-600', className)}>
    <span aria-hidden className="[&_svg]:size-3.5">{icon}</span>
    {children}
  </span>
);

const iconButton = 'size-11 text-slate-600 hover:bg-slate-100 md:size-8';

/** One release of a project: status, dates, progress and its actions. */
const ReleaseCard = ({
  release, workspaceSlug, projectId, canManage, busy = false, onEdit, onRelease, onArchive, onReopen, onDelete,
}: ReleaseCardProps) => {
  const headingId = useId();
  const percent = releasePercent(release.progress);
  const due = describeReleaseDue(release);
  const total = release.progress.counts.total;

  return (
    <Surface as="article" padding="none" aria-labelledby={headingId} className={cn('overflow-hidden', release.status === 'archived' && 'opacity-80')}>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={headingId} className="min-w-0 text-base font-bold text-slate-900">
                <Link
                  to={`/${workspaceSlug}/projects/${projectId}/releases/${release._id}`}
                  className="-mx-1 inline-flex min-h-11 max-w-full items-center rounded-lg px-1 break-words hover:underline focus-visible:outline-2 focus-visible:outline-primary md:min-h-8"
                >
                  {release.name}
                </Link>
              </h3>
              <ReleaseStatusTag release={release} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Meta icon={<CalendarDays />}>{formatReleaseDates(release)}</Meta>
              {due && (
                <Meta icon={release.progress.overdue ? <AlertTriangle /> : <Rocket />} className={cn(release.progress.overdue && 'font-semibold text-warning-fg')}>
                  {due}
                </Meta>
              )}
              <Meta icon={<ListTodo />}>{total} {total === 1 ? 'task' : 'tasks'}</Meta>
            </div>
          </div>

          {canManage && (
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {release.status === 'unreleased' && (
                <Button onClick={() => onRelease(release)} disabled={busy} className="h-11 gap-2 rounded-lg bg-primary px-3 text-sm text-white hover:bg-primary-hover md:h-8">
                  <Rocket className="size-4" aria-hidden /> Release
                </Button>
              )}
              {release.status !== 'unreleased' && (
                <Button variant="ghost" size="icon-sm" onClick={() => onReopen(release)} disabled={busy} aria-label={`Reopen ${release.name}`} title="Reopen" className={iconButton}>
                  {release.status === 'archived' ? <ArchiveRestore /> : <RotateCcw />}
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(release)} aria-label={`Edit ${release.name}`} className={iconButton}>
                <Pencil />
              </Button>
              {release.status !== 'archived' && (
                <Button variant="ghost" size="icon-sm" onClick={() => onArchive(release)} disabled={busy} aria-label={`Archive ${release.name}`} title="Archive" className={iconButton}>
                  <Archive />
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => onDelete(release)} aria-label={`Delete ${release.name}`} className={cn(iconButton, 'hover:bg-danger-bg hover:text-danger-fg')}>
                <Trash2 />
              </Button>
            </div>
          )}
        </div>

        {release.description && <p className="line-clamp-2 text-sm text-slate-700">{release.description}</p>}

        <div>
          <div className="mb-1 flex justify-between gap-3 text-xs text-slate-600">
            <span>Progress</span>
            <span className="tabular-nums">{describeReleaseProgress(release.progress)}</span>
          </div>
          <ProgressBar value={percent} label={`${release.name} progress`} showValue />
        </div>
      </div>
    </Surface>
  );
};

export default ReleaseCard;
