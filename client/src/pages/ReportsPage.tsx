import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AlarmClock, AlertCircle, CalendarClock, CheckSquare, ListTodo, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import StatCard from '../components/StatCard';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { cn } from '@/lib/utils';
import {
  DueDate, PRIORITY_META, STATUS_META, StatusBadge, TASK_PRIORITIES, TASK_STATUSES, buildReport, useTasks,
  type Task,
} from '@/features/tasks';

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
    <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>
    {children}
  </section>
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
        <li key={task._id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0 truncate text-sm text-slate-700">
            {task.title}
            {task.project && <span className="ml-2 text-xs text-slate-500 bg-slate-100 rounded px-1.5">{task.project}</span>}
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
  const { user, logout } = useAuthGuard();
  const { tasks, loading, error, clearError } = useTasks(workspaceSlug);

  const report = useMemo(() => buildReport(tasks), [tasks]);

  if (!user) return null;

  const maxWeek = Math.max(1, ...report.completedPerWeek.map(week => week.count));

  return (
    <Sidebar user={user} onLogout={logout}>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Task analytics for this workspace</p>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" aria-busy="true" aria-label="Loading reports">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
                <div className="h-5 w-24 bg-slate-200 rounded mb-4"></div>
                <div className="h-8 w-12 bg-slate-200 rounded mb-2"></div>
                <div className="h-4 w-32 bg-slate-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {error && (
              <div role="alert" className="flex items-start justify-between gap-3 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
                <span className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </span>
                <button type="button" onClick={clearError} aria-label="Dismiss" className="text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard title="Total Tasks" value={report.total} subtitle={`${report.byStatus.pending} pending`} icon={<ListTodo className="w-4 h-4" />} colorClass="text-slate-600" />
              <StatCard title="Completion Rate" value={`${report.completionRate}%`} subtitle={`${report.byStatus.completed} of ${report.total} completed`} icon={<CheckSquare className="w-4 h-4" />} colorClass="text-emerald-600" />
              <StatCard title="Overdue" value={report.overdue.length} subtitle={report.overdue.length ? 'Missed deadlines' : 'All on track'} icon={<AlarmClock className="w-4 h-4" />} colorClass="text-red-600" />
              <StatCard title="Due This Week" value={report.dueThisWeek.length} subtitle="Next 7 days, not completed" icon={<CalendarClock className="w-4 h-4" />} colorClass="text-blue-600" />
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
      </div>
    </Sidebar>
  );
};

export default ReportsPage;
