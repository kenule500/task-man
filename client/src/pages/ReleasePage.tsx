import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, CalendarDays, CheckCircle2, CircleDashed, FolderKanban, ListTodo, Pencil, Rocket, RotateCcw, Target, Trash2 } from 'lucide-react';
import AppShell from '@/components/AppShell';
import {
  AvatarStack, Breadcrumbs, EmptyState, ErrorState, PageHeader, ProgressRing, SkeletonCards, StatCard, Surface, Tag, TypeBadge,
} from '@/components/ds';
import { Button, buttonVariants } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import ReleaseDialogs, { type ReleaseDialogState } from '@/features/releases/components/ReleaseDialogs';
import ReleaseNotesPanel from '@/features/releases/components/ReleaseNotesPanel';
import ReleaseStatusTag from '@/features/releases/components/ReleaseStatusTag';
import { useRelease } from '@/features/releases/hooks/useRelease';
import { useReleases } from '@/features/releases/hooks/useReleases';
import { useReleaseStatus } from '@/features/releases/hooks/useReleaseStatus';
import {
  describeReleaseDue, describeReleaseProgress, formatReleaseDates, groupReleaseTasks, releasePercent,
} from '@/features/releases/lib/progress';
import type { Release, ReleaseDetail, ReleaseTask } from '@/features/releases/types';


const TaskRow = ({ task, slug }: { task: ReleaseTask; slug: string }) => {
  const { t } = useTranslation('projects');
  return (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5">
    <TypeBadge type={task.type === 'epic' ? 'task' : task.type} size="sm" />
    {task.key && <span className="font-mono text-xs tabular-nums text-slate-500">{task.key}</span>}
    <Link
      to={`/${slug}/tasks?task=${encodeURIComponent(task._id)}`}
      className="-my-2 inline-flex min-h-11 min-w-0 flex-1 basis-40 items-center rounded px-1 text-sm font-medium text-slate-900 break-words outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary md:min-h-8"
    >
      {task.title}
    </Link>
    {typeof task.storyPoints === 'number' && (
      <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-medium tabular-nums text-slate-600" title={t('releasePage.storyPoints')}>
        {task.storyPoints}
      </span>
    )}
    <AvatarStack people={(task.assignees ?? []).map(user => ({ name: user.name, src: user.avatarUrl || undefined }))} max={3} />
  </li>
  );
};

interface ReleaseBodyProps {
  detail: ReleaseDetail;
  notesMarkdown: string;
  slug: string;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onRelease: () => void;
  onArchive: () => void;
  onReopen: () => void;
  onDelete: () => void;
  backToProject: React.ReactNode;
}

const ReleaseBody = ({
  detail, notesMarkdown, slug, canManage, busy, onEdit, onRelease, onArchive, onReopen, onDelete, backToProject,
}: ReleaseBodyProps) => {
  const { t } = useTranslation('projects');
  const pointsLabel = (points: number) => t('form.points', { count: points, ns: 'tasks' });
  const { progress } = detail;
  const percent = releasePercent(progress);
  const groups = useMemo(() => groupReleaseTasks(detail.tasks), [detail.tasks]);
  const due = describeReleaseDue(detail);
  const projectHref = `/${slug}/projects/${detail.project._id}`;

  return (
    <>
      <Breadcrumbs
        label={t('releasePage.breadcrumb')}
        items={[
          { label: t('releasePage.projects'), href: `/${slug}/projects` },
          { label: detail.project.name, href: projectHref },
          { label: t('releasePage.releases'), href: `${projectHref}?tab=releases` },
          { label: detail.name },
        ]}
        renderLink={(item, className) => <Link to={item.href} className={className}>{item.label}</Link>}
      />

      <PageHeader
        title={detail.name}
        description={(
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ReleaseStatusTag release={detail} size="md" />
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <CalendarDays aria-hidden className="size-3.5" /> {formatReleaseDates(detail)}
            </span>
            {due && <span className={cn('tabular-nums', progress.overdue && 'font-semibold text-warning-fg')}>{due}</span>}
            <span>{detail.project.name}</span>
          </span>
        )}
        actions={(
          <>
            {backToProject}
            {canManage && detail.status === 'unreleased' && (
              <Button onClick={onRelease} disabled={busy} className="h-11 gap-2 rounded-lg bg-primary text-sm text-white shadow-sm hover:bg-primary-hover md:h-9">
                <Rocket className="size-4" aria-hidden /> {t('releases.card.release')}
              </Button>
            )}
            {canManage && detail.status !== 'unreleased' && (
              <Button variant="outline" onClick={onReopen} disabled={busy} className="h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-800 shadow-none md:h-9">
                {detail.status === 'archived' ? <ArchiveRestore className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />} {t('releases.card.reopen')}
              </Button>
            )}
            {canManage && (
              <Button variant="outline" onClick={onEdit} className="h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-800 shadow-none md:h-9">
                <Pencil className="size-4" aria-hidden /> {t('actions.edit')}
              </Button>
            )}
            {canManage && detail.status !== 'archived' && (
              <Button variant="outline" onClick={onArchive} disabled={busy} className="h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-800 shadow-none md:h-9">
                <Archive className="size-4" aria-hidden /> {t('releases.card.archive')}
              </Button>
            )}
            {canManage && (
              <Button variant="outline" onClick={onDelete} className="h-11 gap-2 rounded-lg border-slate-300 text-sm text-danger-fg shadow-none md:h-9">
                <Trash2 className="size-4" aria-hidden /> {t('actions.delete')}
              </Button>
            )}
          </>
        )}
      />

      {detail.description && <p className="max-w-3xl whitespace-pre-line text-sm text-slate-700">{detail.description}</p>}

      <section aria-label={t('releasePage.summary')} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Surface className="col-span-2 flex items-center gap-4 p-4 lg:col-span-1">
          <ProgressRing value={percent} label={t('releases.card.progressOf', { name: detail.name })} size={64} strokeWidth={6} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{t('releasePage.progress')}</p>
            <p className="text-xs text-slate-600">{describeReleaseProgress(progress)}</p>
          </div>
        </Surface>
        <StatCard className="p-4" icon={<CircleDashed />} title={t('releasePage.todo')} value={progress.counts.pending} subtitle={pointsLabel(progress.points.pending)} colorClass="text-slate-600" />
        <StatCard className="p-4" icon={<ListTodo />} title={t('releasePage.inProgress')} value={progress.counts['in-progress']} subtitle={pointsLabel(progress.points['in-progress'])} colorClass="text-blue-600" />
        <StatCard className="p-4" icon={<CheckCircle2 />} title={t('releasePage.done')} value={progress.counts.completed} subtitle={pointsLabel(progress.points.completed)} colorClass="text-success-fg" />
        <StatCard className="col-span-2 p-4 lg:col-span-1" icon={<Target />} title={t('releasePage.totalPoints')} value={progress.points.total} subtitle={t('releases.card.tasks', { count: progress.counts.total })} colorClass="text-violet-600" />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section aria-label={t('releasePage.tasksRegion')} className="min-w-0 space-y-3">
          {groups.length === 0 ? (
            <Surface padding="none">
              <EmptyState
                className="py-10"
                icon={<Rocket />}
                title={t('releasePage.noTasks')}
                description={t('releasePage.noTasksBody')}
              />
            </Surface>
          ) : groups.map(group => (
            <Surface key={group.status} as="section" padding="none" aria-label={group.label} className="overflow-hidden">
              <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 sm:px-5">
                {group.label}
                <Tag tone="neutral" size="sm" className="tabular-nums">{group.tasks.length}</Tag>
              </h2>
              <ul className="divide-y divide-slate-100">
                {group.tasks.map(task => <TaskRow key={task._id} task={task} slug={slug} />)}
              </ul>
            </Surface>
          ))}
        </section>

        <ReleaseNotesPanel markdown={notesMarkdown} />
      </div>
    </>
  );
};

/** One release: status, dates, progress, its tasks by status group and the generated release notes. */
const ReleasePage = () => {
  const { t } = useTranslation('projects');
  const { workspaceSlug = '', projectId = '', releaseId } = useParams<{ workspaceSlug: string; projectId: string; releaseId: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canManage = can('projects:write');
  const { release, notes, error, loading, reload } = useRelease(workspaceSlug, releaseId);
  const { releases, create, update, remove, release: releaseNow } = useReleases(workspaceSlug);
  const status = useReleaseStatus(update, reload);
  const [dialog, setDialog] = useState<ReleaseDialogState>(null);

  const backToProject = (
    <Link
      to={`/${workspaceSlug}/projects/${projectId}?tab=releases`}
      className={buttonVariants({ variant: 'outline', className: 'h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-800 shadow-none md:h-9' })}
    >
      <FolderKanban className="size-4" aria-hidden /> {t('releasePage.backToReleases')}
    </Link>
  );

  const asRelease = (detail: ReleaseDetail): Release => ({ ...detail, project: detail.project._id });

  return (
    <AppShell>
      {loading ? (
        <>
          <h1 className="sr-only">{t('releasePage.release')}</h1>
          <SkeletonCards count={4} columns="grid-cols-2 lg:grid-cols-4" className="gap-3 sm:gap-5" />
        </>
      ) : !release ? (
        <>
          <h1 className="sr-only">{t('releasePage.release')}</h1>
          <Surface padding="none">
            {error && !/not found/i.test(error) ? (
              <ErrorState
                title={t('releasePage.loadFailed')}
                reason={error}
                nextStep={t('releasePage.loadNext')}
                action={backToProject}
              />
            ) : (
              <EmptyState icon={<Rocket />} title={t('releasePage.notFound')} description={t('releasePage.notFoundBody')} action={backToProject} />
            )}
          </Surface>
        </>
      ) : (
        <>
          <ReleaseBody
            detail={release}
            notesMarkdown={notes?.markdown ?? ''}
            slug={workspaceSlug}
            canManage={canManage}
            busy={status.busyId === release._id}
            onEdit={() => setDialog({ kind: 'edit', release: asRelease(release) })}
            onRelease={() => setDialog({ kind: 'release', release: asRelease(release) })}
            onArchive={() => { void status.archive(asRelease(release)); }}
            onReopen={() => { void status.reopen(asRelease(release)); }}
            onDelete={() => setDialog({ kind: 'delete', release: asRelease(release) })}
            backToProject={backToProject}
          />
          <ReleaseDialogs
            dialog={dialog}
            onClose={() => setDialog(null)}
            projectId={release.project._id}
            releases={releases}
            actions={{ create, update, remove, release: releaseNow }}
            onDone={kind => {
              if (kind === 'delete') navigate(`/${workspaceSlug}/projects/${release.project._id}?tab=releases`);
              else reload();
            }}
          />
        </>
      )}
    </AppShell>
  );
};

export default ReleasePage;
