import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  ChartGantt,
  Check,
  CheckSquare,
  Clock,
  Copy,
  List,
  ListTodo,
  SquareKanban,
  Users,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import StatCard from '../components/StatCard';
import api from '../utils/api';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { Button } from '@/components/ui/button';
import {
  DueDate,
  PriorityIndicator,
  StatusBadge,
  addDays,
  dateKeyOf,
  getTaskStats,
  isOverdue,
  todayKey,
  toDateKey,
  useTasks,
  type Task,
} from '@/features/tasks';

interface Workspace {
  _id: string;
  name: string;
  slug: string;
  inviteCode: string;
  createdAt?: string;
  members?: { user: string; role: string; joinedAt: string }[];
}

const MAX_ROWS = 6;

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const byDeadline = (a: Task, b: Task) => dateKeyOf(a.deadline).localeCompare(dateKeyOf(b.deadline));

const VIEW_LINKS = [
  { view: 'list', label: 'List', hint: 'Dense table with inline edits', icon: List },
  { view: 'board', label: 'Board', hint: 'Kanban by status', icon: SquareKanban },
  { view: 'calendar', label: 'Calendar', hint: 'Deadlines by month', icon: CalendarDays },
  { view: 'timeline', label: 'Timeline', hint: 'Schedule and dependencies', icon: ChartGantt },
] as const;

interface TaskListCardProps {
  title: string;
  tone: 'default' | 'danger';
  tasks: Task[];
  total: number;
  slug: string;
  emptyText: string;
}

const TaskListCard = ({ title, tone, tasks, total, slug, emptyText }: TaskListCardProps) => (
  <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
    <div className="flex items-center justify-between mb-3">
      <h2 className={`text-sm font-semibold ${tone === 'danger' ? 'text-red-600' : 'text-slate-900'}`}>{title}</h2>
      <span className="text-xs text-slate-400 tabular-nums">{total}</span>
    </div>
    {tasks.length === 0 ? (
      <p className="text-sm text-slate-500 py-4">{emptyText}</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {tasks.map(task => (
          <li key={task._id}>
            <Link
              to={`/${slug}/tasks?view=list`}
              className="flex items-center justify-between gap-3 py-3 rounded-lg hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary px-2 -mx-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                <div className="flex items-center gap-3 mt-1">
                  <DueDate deadline={task.deadline} completed={task.status === 'completed'} />
                  <PriorityIndicator priority={task.priority} />
                </div>
              </div>
              <StatusBadge status={task.status} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    )}
    {total > tasks.length && (
      <p className="text-xs text-slate-400 mt-3">
        Showing {tasks.length} of {total}.{' '}
        <Link to={`/${slug}/tasks?view=list`} className="text-primary font-medium hover:underline">View all</Link>
      </p>
    )}
  </section>
);

const DashboardSkeleton = () => (
  <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading dashboard">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {[0, 1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-slate-100" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {[0, 1].map(i => <div key={i} className="h-64 bg-white rounded-2xl border border-slate-100" />)}
    </div>
  </div>
);

const DashboardPage = () => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { user, logout } = useAuthGuard();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceCount, setWorkspaceCount] = useState(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(!!workspaceSlug);
  const [copied, setCopied] = useState(false);

  const { tasks, loading: tasksLoading, error: tasksError } = useTasks(workspaceSlug);

  // Fetch live data: current workspace + user's workspace count
  useEffect(() => {
    if (!workspaceSlug) return;

    (async () => {
      try {
        setWorkspaceLoading(true);

        const [workspaceRes, allWorkspacesRes] = await Promise.all([
          api.get(`/workspaces/${workspaceSlug}`),
          api.get('/workspaces'),
        ]);

        setWorkspace(workspaceRes.data);
        setWorkspaceCount(allWorkspacesRes.data?.length || 0);
      } catch (err) {
        console.error('Failed to load workspace:', err);
      } finally {
        setWorkspaceLoading(false);
      }
    })();
  }, [workspaceSlug]);

  const stats = useMemo(() => getTaskStats(tasks), [tasks]);

  const { dueThisWeek, overdue } = useMemo(() => {
    const today = todayKey();
    const weekEnd = toDateKey(addDays(new Date(), 7));
    const unfinished = tasks.filter(task => task.status !== 'completed');
    return {
      dueThisWeek: unfinished
        .filter(task => {
          const key = dateKeyOf(task.deadline);
          return key >= today && key <= weekEnd;
        })
        .sort(byDeadline),
      overdue: unfinished.filter(task => isOverdue(task.deadline, false)).sort(byDeadline),
    };
  }, [tasks]);

  const handleCopyCode = () => {
    if (!workspace?.inviteCode) return;
    navigator.clipboard.writeText(workspace.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) return null;

  const slug = workspaceSlug ?? user.activeWorkspaceSlug ?? '';
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const memberCount = workspace?.members?.length ?? 0;

  return (
    <Sidebar user={user} onLogout={logout}>
      <div className="w-full space-y-6 lg:space-y-8">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {getGreeting()}, {firstName}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {workspace?.name ? `Here is what is happening in ${workspace.name}.` : 'Here is your workspace at a glance.'}
            </p>
          </div>
          <Button
            onClick={() => navigate(`/${slug}/tasks`)}
            className="h-9 rounded-lg bg-primary hover:bg-primary-hover shadow-sm text-sm text-white self-start sm:self-auto"
          >
            Go to tasks
          </Button>
        </header>

        {tasksError && (
          <div role="alert" className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl">
            {tasksError}
          </div>
        )}

        {tasksLoading ? (
          <DashboardSkeleton />
        ) : tasks.length === 0 && !tasksError ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 px-6 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <CheckSquare className="size-8" />
            </div>
            <h2 className="text-lg font-semibold text-slate-700 mb-1">No tasks yet</h2>
            <p className="text-sm text-slate-500">Create your first task to see your progress and deadlines here.</p>
            <div className="mt-5 flex justify-center">
              <Button
                onClick={() => navigate(`/${slug}/tasks`)}
                className="h-9 rounded-lg bg-primary hover:bg-primary-hover shadow-sm text-sm text-white"
              >
                Go to tasks
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard title="Total Tasks" value={stats.total} subtitle="All tasks in this workspace" icon={<ListTodo className="w-5 h-5" />} />
              <StatCard title="In Progress" value={stats.inProgress} subtitle="Currently being worked on" icon={<Clock className="w-5 h-5" />} colorClass="text-blue-600" />
              <StatCard title="Completed" value={stats.completed} subtitle="Finished tasks" icon={<CheckSquare className="w-5 h-5" />} colorClass="text-emerald-600" />
              <StatCard title="Overdue" value={stats.overdue} subtitle="Past their due date" icon={<AlertCircle className="w-5 h-5" />} colorClass="text-red-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <TaskListCard
                title="Due this week"
                tone="default"
                tasks={dueThisWeek.slice(0, MAX_ROWS)}
                total={dueThisWeek.length}
                slug={slug}
                emptyText="Nothing due in the next 7 days."
              />
              <TaskListCard
                title="Overdue"
                tone="danger"
                tasks={overdue.slice(0, MAX_ROWS)}
                total={overdue.length}
                slug={slug}
                emptyText="You are all caught up. No overdue tasks."
              />
            </div>
          </>
        )}

        {/* Quick links to the four views */}
        <section aria-labelledby="views-heading">
          <h2 id="views-heading" className="text-sm font-semibold text-slate-900 mb-3">Open a view</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {VIEW_LINKS.map(({ view, label, hint, icon: Icon }) => (
              <Link
                key={view}
                to={`/${slug}/tasks?view=${view}`}
                className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow focus-visible:outline-2 focus-visible:outline-primary flex items-start gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Workspace info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{workspaceLoading ? '-' : memberCount}</p>
              <p className="text-xs text-slate-400">
                {memberCount === 1 ? 'Member (just you so far)' : 'Members'} · {workspaceLoading ? '-' : workspaceCount} workspace{workspaceCount !== 1 ? 's' : ''} joined
              </p>
            </div>
          </div>

          {workspace?.inviteCode && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 lg:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm mb-1">Invite teammates to this workspace</p>
                  <p className="text-xs text-slate-500">Share this code. They will be able to join instantly.</p>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex-shrink-0">
                  <code className="text-sm font-mono text-slate-700 font-semibold tracking-wider truncate">
                    {workspace.inviteCode}
                  </code>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline flex-shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sidebar>
  );
};

export default DashboardPage;
