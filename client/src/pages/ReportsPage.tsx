import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AlarmClock, CalendarClock, CheckSquare, ListTodo } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, PageHeader, SectionHeader, SkeletonCards, StatCard, Surface, Tag } from '@/components/ds';
import { cn } from '@/lib/utils';
import {
  DueDate, PRIORITY_META, STATUS_META, StatusBadge, TASK_PRIORITIES, TASK_STATUSES, buildReport, useTasks,
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
  const share = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-slate-700">{label}</span>
      <div
        role="img"
        aria-label={`${label}: ${count} of ${total} tasks (${share}%)`}
        className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"
      >
        <div className={cn('h-full rounded-full', dot)} style={{ width: `${share}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-slate-500 tabular-nums">{count}</span>
    </li>
  );
};

const TaskList = ({ tasks, empty }: { tasks: Task[]; empty: string }) =>
  tasks.length === 0 ? (
    <p className="text-sm text-slate-400">{empty}</p>
  ) : (
    <ul className="divide-y divide-slate-100">
      {tasks.map(task => (
        <li key={task._id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="min-w-0 truncate text-sm text-slate-700">
            {task.title}
            {task.project && <Tag size="sm" className="ml-2 align-middle">{task.project}</Tag>}
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
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { tasks, loading, error, clearError } = useTasks(workspaceSlug);

  const report = useMemo(() => buildReport(tasks), [tasks]);

  const maxWeek = Math.max(1, ...report.completedPerWeek.map(week => week.count));

  return (
    <AppShell>
      <PageHeader title="Reports" description="Task analytics for this workspace" />

      {loading ? (
        <SkeletonCards count={4} columns="grid-cols-2 lg:grid-cols-4" className="gap-3 sm:gap-5" />
      ) : (
        <>
          {error && <Alert tone="error" onDismiss={clearError}>{error}</Alert>}

          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            <StatCard className="p-4 sm:p-5" title="Total Tasks" value={report.total} subtitle={`${report.byStatus.pending} pending`} icon={<ListTodo className="w-4 h-4" />} colorClass="text-slate-600" />
            <StatCard className="p-4 sm:p-5" title="Completion Rate" value={`${report.completionRate}%`} subtitle={`${report.byStatus.completed} of ${report.total} completed`} icon={<CheckSquare className="w-4 h-4" />} colorClass="text-emerald-600" />
            <StatCard className="p-4 sm:p-5" title="Overdue" value={report.overdue.length} subtitle={report.overdue.length ? 'Missed deadlines' : 'All on track'} icon={<AlarmClock className="w-4 h-4" />} colorClass="text-red-600" />
            <StatCard className="p-4 sm:p-5" title="Due This Week" value={report.dueThisWeek.length} subtitle="Next 7 days, not completed" icon={<CalendarClock className="w-4 h-4" />} colorClass="text-blue-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title="Tasks by status">
              <ul className="space-y-3">
                {TASK_STATUSES.map(status => (
                  <BarRow key={status} label={STATUS_META[status].label} count={report.byStatus[status]} total={report.total} dot={STATUS_META[status].dot} />
                ))}
              </ul>
            </Panel>
            <Panel title="Tasks by priority">
              <ul className="space-y-3">
                {TASK_PRIORITIES.map(priority => (
                  <BarRow key={priority} label={PRIORITY_META[priority].label} count={report.byPriority[priority]} total={report.total} dot={PRIORITY_META[priority].dot} />
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="Completed per week">
            <ul className="flex items-end gap-3 sm:gap-6 h-44" aria-label="Tasks completed in each of the last 6 weeks">
              {report.completedPerWeek.map(week => (
                <li key={week.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-xs font-medium text-slate-700 tabular-nums">{week.count}</span>
                  <div
                    className={cn('w-full max-w-12 rounded-t-md', week.count > 0 ? 'bg-primary' : 'bg-slate-100')}
                    style={{ height: week.count > 0 ? `${Math.max(6, (week.count / maxWeek) * 100)}px` : '4px' }}
                  />
                  <span className="text-xs text-slate-500 tabular-nums">
                    <span className="sr-only">Week of </span>{week.label}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title="Overdue">
              <TaskList tasks={report.overdue} empty="Nothing is overdue." />
            </Panel>
            <Panel title="Due this week">
              <TaskList tasks={report.dueThisWeek} empty="Nothing due in the next 7 days." />
            </Panel>
          </div>
        </>
      )}
    </AppShell>
  );
};

export default ReportsPage;
