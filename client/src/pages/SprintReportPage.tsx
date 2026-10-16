import { useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CheckCircle2, CircleDashed, FileBarChart, FolderKanban, MinusCircle, PlusCircle, Target } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Breadcrumbs, EmptyState, ErrorState, PageHeader, SkeletonCards, StatCard, Surface, Tag } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import ReportTable from '@/features/planning/components/ReportTable';
import { useSprintReport } from '@/features/planning/hooks/useSprintReport';
import { deliveredPercent, pointsLabel, scopeTasksOf, type SprintReport } from '@/features/planning/lib/sprintReport';
import { BurndownChart, buildBurndown, formatSprintRange, type Burndown } from '@/features/projects';

const STATUS_TAG = {
  planned: { tone: 'neutral' },
  active: { tone: 'primary' },
  completed: { tone: 'success' },
} as const;

interface ReportBodyProps {
  report: SprintReport;
  slug: string;
  burndown: Burndown | null;
  backToProject: ReactNode;
}

const ReportBody = ({ report, slug: workspaceSlug, burndown, backToProject }: ReportBodyProps) => {
  const { t } = useTranslation('planning');
  const { sprint, summary } = report;
  const status = STATUS_TAG[sprint.status];
  const delivered = deliveredPercent(summary);

  return (
    <>
      <Breadcrumbs
        label={t('reportPage.breadcrumb')}
        items={[
          { label: t('reportPage.projects'), href: `/${workspaceSlug}/projects` },
          { label: sprint.projectName, href: `/${workspaceSlug}/projects/${sprint.project}` },
          { label: sprint.name, href: `/${workspaceSlug}/projects/${sprint.project}` },
          { label: t('reportPage.report') },
        ]}
        renderLink={(item, className) => <Link to={item.href} className={className}>{item.label}</Link>}
      />

      <PageHeader
        title={t('reportPage.title', { name: sprint.name })}
        description={(
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Tag tone={status.tone} size="sm">{t(`reportPage.${sprint.status}`)}</Tag>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <CalendarDays aria-hidden className="size-3.5" /> {formatSprintRange(sprint)}
            </span>
            <span>{sprint.projectName}</span>
          </span>
        )}
        actions={backToProject}
      />

      {sprint.goal && (
        <p className="flex items-start gap-2 text-sm text-slate-700">
          <Target aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-500" />
          <span><span className="font-semibold">{t('reportPage.goal')}</span> {sprint.goal}</span>
        </p>
      )}

      <section aria-label={t('reportPage.summary')} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard className="p-4" title={t('reportPage.committed')} value={pointsLabel(summary.committed.points)} subtitle={t('reportPage.committedSub', { n: summary.committed.count })} icon={<Target />} colorClass="text-slate-600" />
        <StatCard className="p-4" title={t('reportPage.completedCard')} value={pointsLabel(summary.completed.points)} subtitle={t('reportPage.completedSub', { n: summary.completed.count, percent: delivered })} icon={<CheckCircle2 />} colorClass="text-success-fg" />
        <StatCard className="p-4" title={t('reportPage.notCompleted')} value={pointsLabel(summary.notCompleted.points)} subtitle={t('reportPage.itemsSub', { n: summary.notCompleted.count })} icon={<CircleDashed />} colorClass="text-warning-fg" />
        <StatCard className="p-4" title={t('reportPage.added')} value={pointsLabel(summary.added.points)} subtitle={t('reportPage.itemsSub', { n: summary.added.count })} icon={<PlusCircle />} colorClass="text-blue-600" />
        <StatCard className="p-4" title={t('reportPage.removed')} value={pointsLabel(summary.removed.points)} subtitle={t('reportPage.itemsSub', { n: summary.removed.count })} icon={<MinusCircle />} colorClass="text-danger-fg" />
      </section>

      <Surface as="section" aria-labelledby="report-burndown" padding="sm" className="sm:p-5">
        <h2 id="report-burndown" className="mb-2 text-sm font-semibold text-slate-900">{t('reportPage.burndown')}</h2>
        {burndown && burndown.total > 0 ? (
          <div className="overflow-x-auto">
            <BurndownChart burndown={burndown} title={t('reportPage.burndownOf', { name: sprint.name })} />
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            {sprint.startedAt
              ? t('reportPage.nothingToBurn')
              : t('reportPage.burndownLater')}
          </p>
        )}
      </Surface>

      <div className="space-y-4">
        <ReportTable title={t('reportPage.completedCard')} total={summary.completed} items={report.completed} slug={workspaceSlug} projectKey={sprint.projectKey} empty={t('reportPage.emptyCompleted')} />
        <ReportTable title={t('reportPage.notCompleted')} total={summary.notCompleted} items={report.notCompleted} slug={workspaceSlug} projectKey={sprint.projectKey} empty={t('reportPage.emptyNotCompleted')} />
        <ReportTable title={t('reportPage.added')} total={summary.added} items={report.added} slug={workspaceSlug} projectKey={sprint.projectKey} empty={t('reportPage.emptyAdded')} />
        <ReportTable title={t('reportPage.removed')} total={summary.removed} items={report.removed} slug={workspaceSlug} projectKey={sprint.projectKey} empty={t('reportPage.emptyRemoved')} />
      </div>

      {sprint.status === 'completed' && (
        <p className="text-xs text-slate-600">
          {t('reportPage.completedNote')}
        </p>
      )}
    </>
  );
};

/** Jira-style sprint report: what was committed, delivered, added after the start and removed. */
const SprintReportPage = () => {
  const { t } = useTranslation('planning');
  const { workspaceSlug = '', projectId, sprintId } = useParams<{ workspaceSlug: string; projectId: string; sprintId: string }>();
  const { report, error, loading } = useSprintReport(workspaceSlug, projectId, sprintId);

  const burndown = useMemo(
    () => (report && report.sprint.startedAt ? buildBurndown(report.sprint, scopeTasksOf(report)) : null),
    [report],
  );

  const backToProject = (
    <Link
      to={`/${workspaceSlug}/projects/${projectId ?? ''}`}
      className={buttonVariants({ variant: 'outline', className: 'h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-800 shadow-none md:h-9' })}
    >
      <FolderKanban className="size-4" aria-hidden /> {t('reportPage.backToProject')}
    </Link>
  );

  return (
    <AppShell>
      {loading ? (
        <>
          <h1 className="sr-only">{t('reportPage.sprintReport')}</h1>
          <SkeletonCards count={5} columns="grid-cols-2 lg:grid-cols-5" className="gap-3 sm:gap-5" />
        </>
      ) : !report ? (
        <>
          <h1 className="sr-only">{t('reportPage.sprintReport')}</h1>
          <Surface padding="none">
            {error ? (
              <ErrorState
                title={t('reportPage.loadFailed')}
                reason={error}
                nextStep={t('reportPage.loadNext')}
                action={backToProject}
              />
            ) : (
              <EmptyState icon={<FileBarChart />} title={t('reportPage.notFound')} description={t('reportPage.notFoundBody')} action={backToProject} />
            )}
          </Surface>
        </>
      ) : (
        <>
          <ReportBody report={report} slug={workspaceSlug} burndown={burndown} backToProject={backToProject} />
        </>
      )}
    </AppShell>
  );
};

export default SprintReportPage;
