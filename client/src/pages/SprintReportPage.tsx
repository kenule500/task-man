import { useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, CircleDashed, FileBarChart, FolderKanban, MinusCircle, PlusCircle, Target } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Breadcrumbs, EmptyState, ErrorState, PageHeader, SkeletonCards, StatCard, Surface, Tag } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import ReportTable from '@/features/planning/components/ReportTable';
import { useSprintReport } from '@/features/planning/hooks/useSprintReport';
import { deliveredPercent, pointsLabel, scopeTasksOf, type SprintReport } from '@/features/planning/lib/sprintReport';
import { BurndownChart, buildBurndown, formatSprintRange, type Burndown } from '@/features/projects';

const STATUS_TAG = {
  planned: { tone: 'neutral', label: 'Planned' },
  active: { tone: 'primary', label: 'Active' },
  completed: { tone: 'success', label: 'Completed' },
} as const;

interface ReportBodyProps {
  report: SprintReport;
  slug: string;
  burndown: Burndown | null;
  backToProject: ReactNode;
}

const ReportBody = ({ report, slug: workspaceSlug, burndown, backToProject }: ReportBodyProps) => {
  const { sprint, summary } = report;
  const status = STATUS_TAG[sprint.status];
  const delivered = deliveredPercent(summary);

  return (
    <>
      <Breadcrumbs
        label="Breadcrumb"
        items={[
          { label: 'Projects', href: `/${workspaceSlug}/projects` },
          { label: sprint.projectName, href: `/${workspaceSlug}/projects/${sprint.project}` },
          { label: sprint.name, href: `/${workspaceSlug}/projects/${sprint.project}` },
          { label: 'Report' },
        ]}
        renderLink={(item, className) => <Link to={item.href} className={className}>{item.label}</Link>}
      />

      <PageHeader
        title={`${sprint.name} report`}
        description={(
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Tag tone={status.tone} size="sm">{status.label}</Tag>
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
          <span><span className="font-semibold">Goal:</span> {sprint.goal}</span>
        </p>
      )}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard className="p-4" title="Committed" value={pointsLabel(summary.committed.points)} subtitle={`${summary.committed.count} items at the start`} icon={<Target />} colorClass="text-slate-600" />
        <StatCard className="p-4" title="Completed" value={pointsLabel(summary.completed.points)} subtitle={`${summary.completed.count} items · ${delivered}% delivered`} icon={<CheckCircle2 />} colorClass="text-emerald-600" />
        <StatCard className="p-4" title="Not completed" value={pointsLabel(summary.notCompleted.points)} subtitle={`${summary.notCompleted.count} items`} icon={<CircleDashed />} colorClass="text-amber-600" />
        <StatCard className="p-4" title="Added after start" value={pointsLabel(summary.added.points)} subtitle={`${summary.added.count} items`} icon={<PlusCircle />} colorClass="text-blue-600" />
        <StatCard className="p-4" title="Removed" value={pointsLabel(summary.removed.points)} subtitle={`${summary.removed.count} items`} icon={<MinusCircle />} colorClass="text-red-600" />
      </section>

      <Surface as="section" aria-labelledby="report-burndown" padding="sm" className="sm:p-5">
        <h2 id="report-burndown" className="mb-2 text-sm font-semibold text-slate-900">Burndown</h2>
        {burndown && burndown.total > 0 ? (
          <div className="overflow-x-auto">
            <BurndownChart burndown={burndown} title={`${sprint.name} burndown`} />
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            {sprint.startedAt
              ? 'No tasks were in this sprint, so there is nothing to burn down.'
              : 'The burndown appears once the sprint has started and has tasks.'}
          </p>
        )}
      </Surface>

      <div className="space-y-4">
        <ReportTable title="Completed" total={summary.completed} items={report.completed} slug={workspaceSlug} projectKey={sprint.projectKey} empty="Nothing was completed in this sprint yet." />
        <ReportTable title="Not completed" total={summary.notCompleted} items={report.notCompleted} slug={workspaceSlug} projectKey={sprint.projectKey} empty="Everything in this sprint is done." />
        <ReportTable title="Added after start" total={summary.added} items={report.added} slug={workspaceSlug} projectKey={sprint.projectKey} empty="No work was added after the sprint started." />
        <ReportTable title="Removed" total={summary.removed} items={report.removed} slug={workspaceSlug} projectKey={sprint.projectKey} empty="No work was removed from the sprint." />
      </div>

      {sprint.status === 'completed' && (
        <p className="text-xs text-slate-600">
          Open work that was moved out when the sprint was completed is found from recorded moves; items created directly inside the sprint may be missing from Not completed.
        </p>
      )}
    </>
  );
};

/** Jira-style sprint report: what was committed, delivered, added after the start and removed. */
const SprintReportPage = () => {
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
      <FolderKanban className="size-4" aria-hidden /> Back to project
    </Link>
  );

  return (
    <AppShell>
      {loading ? (
        <>
          <h1 className="sr-only">Sprint report</h1>
          <SkeletonCards count={5} columns="grid-cols-2 lg:grid-cols-5" className="gap-3 sm:gap-5" />
        </>
      ) : !report ? (
        <>
          <h1 className="sr-only">Sprint report</h1>
          <Surface padding="none">
            {error ? (
              <ErrorState
                title="We could not load this report"
                reason={error}
                nextStep="Check your connection and try again. If the sprint was deleted, pick another one from the project."
                action={backToProject}
              />
            ) : (
              <EmptyState icon={<FileBarChart />} title="Report not found" description="The sprint may have been deleted, or the link is wrong." action={backToProject} />
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
