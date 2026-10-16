import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ActiveSprints from '@/components/dashboard/ActiveSprints';
import { usePermissions } from '@/hooks/usePermissions';
import { VelocityChart, averageVelocity, sprintVelocities, useProjects } from '@/features/projects';
import { AlarmClock, CalendarClock, CheckSquare, ListTodo } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FlowReportPanel } from '@/features/flow';
import { Alert, AnimatedNumber, PageHeader, SectionHeader, SkeletonChart, StatCard, Surface, Tag } from '@/components/ds';
import { cn } from '@/lib/utils';
import {
  DueDate, PRIORITY_META, STATUS_META, StatusBadge, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, TASK_TYPE_META, buildReport, useTasks,
  type Task,
} from '@/features/tasks';

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Surface as="section" padding="sm" className="sm:p-5">
    <SectionHeader title={title} />
    {children}
  </Surface>
);

interface BarRowProps {
  label: string;
  count: number;
  total: number;
  dot: string;
}

const BarRow = ({ label, count, total, dot }: BarRowProps) => {
  const { t } = useTranslation('reports');
  const share = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-slate-700">{label}</span>
      <div
        role="img"
        aria-label={t('page.barLabel', { label, count, total, share })}
        className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"
      >
        <div className={cn('h-full rounded-full', dot)} style={{ width: `${share}%` }} />
      </div>
      <span className="w-12 shrink-0 text-end text-slate-500 tabular-nums">{count}</span>
    </li>
  );
};

const TaskList = ({ tasks, empty }: { tasks: Task[]; empty: string }) =>
  tasks.length === 0 ? (
    <p className="text-sm text-slate-500">{empty}</p>
  ) : (
    <ul className="divide-y divide-slate-100">
      {tasks.map(task => (
        <li key={task._id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="min-w-0 truncate text-sm text-slate-700">
            {task.title}
            {task.project && <Tag size="sm" className="ms-2 align-middle">{task.project}</Tag>}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <StatusBadge status={task.status} />
            <DueDate deadline={task.deadline} completed={task.status === 'completed'} />
          </span>
        </li>
      ))}
    </ul>
  );

const ReportsPage = () => {
  const { t } = useTranslation('reports');
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();
  // A role may see reports without reading tasks: then there is nothing task-based to load
  const { tasks, loading, error, clearError } = useTasks(can('tasks:read') ? workspaceSlug : undefined);
  const { projects } = useProjects(can('projects:read') ? workspaceSlug : undefined);

  const report = useMemo(() => buildReport(tasks), [tasks]);
  // Scrum metrics count top-level work items (subtasks are part of their parent)
  const workItems = useMemo(() => tasks.filter(task => !task.parent), [tasks]);
  const byType = useMemo(
    () => Object.fromEntries(TASK_TYPES.map(type => [type, workItems.filter(task => (task.type ?? 'task') === type).length])),
    [workItems],
  );
  const velocityProjects = projects.filter(project => sprintVelocities(project.sprints).length > 0);

  const maxWeek = Math.max(1, ...report.completedPerWeek.map(week => week.count));

  const [searchParams, setSearchParams] = useSearchParams();
  const canSeeFlow = can('projects:read') && Boolean(workspaceSlug);
  const tab = canSeeFlow && searchParams.get('tab') === 'flow' ? 'flow' : 'overview';
  const changeTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'flow') next.set('tab', 'flow');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  const overview = (
    <>
      {loading ? (
        <SkeletonChart label={t('page.loading')} height="h-64" />
      ) : (
        <>
          {error && <Alert tone="error" onDismiss={clearError}>{error}</Alert>}

          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            <StatCard index={0} className="p-4 sm:p-5" title={t('page.totalTasks')} value={report.total} subtitle={t('page.pendingSub', { n: report.byStatus.pending })} icon={<ListTodo className="w-4 h-4" />} colorClass="text-slate-600" />
            <StatCard index={1} className="p-4 sm:p-5" title={t('page.completionRate')} value={<><AnimatedNumber value={report.completionRate} />%</>} subtitle={t('page.completedOf', { done: report.byStatus.completed, total: report.total })} icon={<CheckSquare className="w-4 h-4" />} colorClass="text-success-fg" />
            <StatCard index={2} className="p-4 sm:p-5" title={t('page.overdue')} value={report.overdue.length} subtitle={report.overdue.length ? t('page.missed') : t('page.onTrack')} icon={<AlarmClock className="w-4 h-4" />} colorClass="text-danger-fg" />
            <StatCard index={3} className="p-4 sm:p-5" title={t('page.dueThisWeek')} value={report.dueThisWeek.length} subtitle={t('page.next7')} icon={<CalendarClock className="w-4 h-4" />} colorClass="text-blue-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title={t('page.byStatus')}>
              <ul className="space-y-3">
                {TASK_STATUSES.map(status => (
                  <BarRow key={status} label={t(`tasks:status.${status}`)} count={report.byStatus[status]} total={report.total} dot={STATUS_META[status].dot} />
                ))}
              </ul>
            </Panel>
            <Panel title={t('page.byPriority')}>
              <ul className="space-y-3">
                {TASK_PRIORITIES.map(priority => (
                  <BarRow key={priority} label={t(`tasks:priority.${priority}`)} count={report.byPriority[priority]} total={report.total} dot={PRIORITY_META[priority].dot} />
                ))}
              </ul>
            </Panel>
          </div>

          <ActiveSprints projects={projects} tasks={tasks} slug={workspaceSlug ?? ''} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title={t('page.byType')}>
              <ul className="space-y-3">
                {TASK_TYPES.map(type => (
                  <BarRow key={type} label={t(`tasks:type.${type}`)} count={byType[type]} total={workItems.length} dot={TASK_TYPE_META[type].dot} />
                ))}
              </ul>
            </Panel>
            <Panel title={t('page.velocity')}>
              {velocityProjects.length === 0 ? (
                <p className="text-sm text-slate-600">{t('page.velocityEmpty')}</p>
              ) : (
                <div className="space-y-5">
                  {velocityProjects.map(project => (
                    <div key={project._id}>
                      <p className="mb-2 text-xs font-semibold text-slate-700">{project.name}</p>
                      <VelocityChart velocities={sprintVelocities(project.sprints)} average={averageVelocity(project.sprints)} />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel title={t('page.completedPerWeek')}>
            <ul className="flex items-end gap-3 sm:gap-6 h-44" aria-label={t('page.last6Weeks')}>
              {report.completedPerWeek.map(week => (
                <li key={week.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-xs font-medium text-slate-700 tabular-nums">{week.count}</span>
                  <div
                    className={cn('w-full max-w-12 rounded-t-md', week.count > 0 ? 'bg-primary' : 'bg-slate-100')}
                    style={{ height: week.count > 0 ? `${Math.max(6, (week.count / maxWeek) * 100)}px` : '4px' }}
                  />
                  <span className="text-xs text-slate-500 tabular-nums">
                    <span className="sr-only">{t('page.weekOfSr')}</span>{week.label}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title={t('page.overduePanel')}>
              <TaskList tasks={report.overdue} empty={t('page.nothingOverdue')} />
            </Panel>
            <Panel title={t('page.dueThisWeek')}>
              <TaskList tasks={report.dueThisWeek} empty={t('page.nothingDue')} />
            </Panel>
          </div>
        </>
      )}
    </>
  );

  return (
    <AppShell>
      <PageHeader title={t('page.title')} description={t('page.description')} />

      {canSeeFlow ? (
        <Tabs value={tab} onValueChange={changeTab} className="gap-5">
          <TabsList aria-label={t('page.sections')} className="w-full group-data-horizontal/tabs:h-11 sm:w-fit sm:group-data-horizontal/tabs:h-9">
            <TabsTrigger value="overview" className="px-4">{t('page.overview')}</TabsTrigger>
            <TabsTrigger value="flow" className="px-4">{t('page.flow')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-5">{overview}</TabsContent>
          <TabsContent value="flow">
            <FlowReportPanel slug={workspaceSlug ?? ''} projects={projects} />
          </TabsContent>
        </Tabs>
      ) : overview}
    </AppShell>
  );
};

export default ReportsPage;
