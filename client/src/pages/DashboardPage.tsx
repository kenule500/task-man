import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  Shield,
  SquareKanban,
  Users,
} from 'lucide-react';
import {
  Alert,
  IconTile,
  PageHeader,
  SectionHeader,
  SkeletonCards,
  StatCard,
  Surface,
  Tag,
  surfaceVariants,
} from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';
import GetStartedChecklist from '@/components/dashboard/GetStartedChecklist';
import ActiveSprints from '@/components/dashboard/ActiveSprints';
import { useProjects } from '@/features/projects';
import {
  buildChecklist, hasTriedBoard, isChecklistComplete, markBoardTried,
} from '@/components/dashboard/getStarted';
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
  members?: { user: string; roleId: string; joinedAt: string }[];
}

const MAX_ROWS = 6;

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const byDeadline = (a: Task, b: Task) =>
  dateKeyOf(a.deadline).localeCompare(dateKeyOf(b.deadline));

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
  <Surface as="section" padding="sm" className="sm:p-5">
    <SectionHeader
      className="mb-3"
      title={tone === 'danger' ? <span className="text-red-700">{title}</span> : title}
      count={total}
    />
    {tasks.length === 0 ? (
      <p className="py-4 text-sm text-slate-600">{emptyText}</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {tasks.map((task) => (
          <li key={task._id}>
            <Link
              to={`/${slug}/tasks?view=list`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
                <div className="mt-1 flex items-center gap-3">
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
      <p className="mt-3 text-xs text-slate-600">
        Showing {tasks.length} of {total}.{' '}
        <Link to={`/${slug}/tasks?view=list`} className="font-medium text-primary hover:underline">
          View all
        </Link>
      </p>
    )}
  </Surface>
);

const DashboardSkeleton = () => (
  <div className="space-y-6">
    <SkeletonCards count={4} columns="grid-cols-2 lg:grid-cols-4" className="gap-3 sm:gap-5" />
    <SkeletonCards count={2} columns="lg:grid-cols-2" />
  </div>
);

const DashboardPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  // ===== RBAC integration =====
  const { user, role, can } = usePermissions();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(!!workspaceSlug);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // ===== Task data (owned by the tasks module) =====
  // Only roles that can read tasks load them (others still see the workspace and invite panels)
  const { tasks, loading: tasksLoading, error: tasksError } = useTasks(can('tasks:read') ? workspaceSlug : undefined);
  const { projects } = useProjects(can('projects:read') ? workspaceSlug : undefined);

  // Fetch workspace info (member count, invite code)
  useEffect(() => {
    if (!workspaceSlug) return;

    (async () => {
      try {
        setWorkspaceLoading(true);
        const workspaceRes = await api.get(`/workspaces/${workspaceSlug}`);
        setWorkspace(workspaceRes.data);
      } catch (err) {
        console.error('Failed to load workspace:', err);
      } finally {
        setWorkspaceLoading(false);
      }
    })();
  }, [workspaceSlug]);

  // ===== Task-derived data =====
  const stats = useMemo(() => getTaskStats(tasks), [tasks]);

  const { dueThisWeek, overdue } = useMemo(() => {
    const today = todayKey();
    const weekEnd = toDateKey(addDays(new Date(), 7));
    const unfinished = tasks.filter((task) => task.status !== 'completed');
    return {
      dueThisWeek: unfinished
        .filter((task) => {
          const key = dateKeyOf(task.deadline);
          return key >= today && key <= weekEnd;
        })
        .sort(byDeadline),
      overdue: unfinished
        .filter((task) => isOverdue(task.deadline, false))
        .sort(byDeadline),
    };
  }, [tasks]);

  const handleCopyCode = async () => {
    if (!workspace?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(workspace.inviteCode);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  };

  if (!user) return null;

  const slug = workspaceSlug ?? user.activeWorkspaceSlug ?? '';
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const memberCount = workspace?.members?.length ?? 0;
  const canManageUsers = can('users:write');

  const ready = !tasksLoading && !workspaceLoading;
  const checklist = buildChecklist({
    taskCount: tasks.length,
    memberCount,
    boardTried: hasTriedBoard(slug),
    canInvite: canManageUsers,
  });
  const showChecklist = ready && !tasksError && !isChecklistComplete(checklist);

  return (
    <>
      {/* ===== Page header with greeting + RBAC role badge ===== */}
      <PageHeader
        title={`${getGreeting()}, ${firstName}`}
        description={
          workspace?.name
            ? `Here is what is happening in ${workspace.name}.`
            : 'Here is your workspace at a glance.'
        }
        actions={
          <>
            {role && (
              <Tag tone="neutral" className="!flex-none px-3 py-1.5">
                <Shield className="size-3.5 text-primary" aria-hidden />
                <span className="sr-only">Your role: </span>
                {role.name}
              </Tag>
            )}
            <Link
              to={`/${slug}/tasks`}
              className={buttonVariants({ className: 'h-10 rounded-lg bg-primary px-4 text-sm text-white shadow-sm hover:bg-primary-hover sm:h-9' })}
            >
              Go to tasks
            </Link>
          </>
        }
      />

      {tasksError && <Alert tone="error">{tasksError}</Alert>}

      {showChecklist && <GetStartedChecklist steps={checklist} workspaceSlug={slug} />}

      {/* ===== Task stats ===== */}
      {tasksLoading ? (
        <DashboardSkeleton />
      ) : (
        tasks.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              <StatCard className="p-4 sm:p-5" title="Total tasks" value={stats.total} subtitle="All tasks in this workspace" icon={<ListTodo className="w-5 h-5" />} />
              <StatCard className="p-4 sm:p-5" title="In progress" value={stats.inProgress} subtitle="Currently being worked on" icon={<Clock className="w-5 h-5" />} colorClass="text-blue-600" />
              <StatCard className="p-4 sm:p-5" title="Completed" value={stats.completed} subtitle="Finished tasks" icon={<CheckSquare className="w-5 h-5" />} colorClass="text-emerald-600" />
              <StatCard className="p-4 sm:p-5" title="Overdue" value={stats.overdue} subtitle="Past their due date" icon={<AlertCircle className="w-5 h-5" />} colorClass="text-red-600" />
            </div>

            <ActiveSprints projects={projects} tasks={tasks} slug={slug} />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
        )
      )}

      {/* ===== Quick views ===== */}
      <section aria-labelledby="views-heading">
        <h2 id="views-heading" className="mb-3 text-sm font-semibold text-slate-900">
          Open a view
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {VIEW_LINKS.map(({ view, label, hint, icon: Icon }) => (
            <Link
              key={view}
              to={`/${slug}/tasks?view=${view}`}
              onClick={view === 'board' ? () => markBoardTried(slug) : undefined}
              className={cn(
                surfaceVariants({ radius: 'lg', padding: 'sm', interactive: true }),
                'flex items-start gap-3 focus-visible:outline-2 focus-visible:outline-primary',
              )}
            >
              <IconTile size="sm">
                <Icon aria-hidden />
              </IconTile>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="mt-0.5 text-xs text-slate-600">{hint}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== Workspace info + invite code ===== */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Surface className="flex items-center gap-4">
          <IconTile>
            <Users />
          </IconTile>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums text-slate-900">
              {workspaceLoading ? <span aria-label="Loading">-</span> : memberCount}
            </p>
            <p className="text-xs text-slate-600">
              {memberCount === 1 ? 'Member (just you so far)' : 'Members'}
            </p>
          </div>
        </Surface>

        {/* Invite code: permission gated */}
        {workspace?.inviteCode && canManageUsers && (
          <Surface className="lg:col-span-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="mb-1 text-sm font-semibold text-slate-900">
                  Invite teammates to this workspace
                </h2>
                <p className="text-xs text-slate-600">
                  Share this code. They can join instantly.
                </p>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1 pl-4 pr-2 sm:justify-start">
                <code className="truncate font-mono text-sm font-semibold tracking-wider text-slate-700">
                  {workspace.inviteCode}
                </code>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex min-h-10 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5" aria-hidden /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" aria-hidden /> Copy
                    </>
                  )}
                  <span className="sr-only"> invite code</span>
                </button>
              </div>
            </div>
            {copyFailed && (
              <p role="alert" className="mt-3 text-xs text-red-700">
                Could not copy automatically. Select the code and copy it manually.
              </p>
            )}
          </Surface>
        )}
      </div>
    </>
  );
};

export default DashboardPage;
