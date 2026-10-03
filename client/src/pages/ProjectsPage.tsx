import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, ChevronDown, FolderKanban, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { cn } from '@/lib/utils';
import {
  DueDate, EmptyState, StatusBadge, dateKeyOf, summarizeProjects, useTasks,
  type ProjectSummary, type Task,
} from '@/features/tasks';

const projectLabel = (name: string) => name || 'No project';

interface ProjectCardProps {
  summary: ProjectSummary;
  tasks: Task[];
  expanded: boolean;
  onToggle: () => void;
}

const ProjectCard = ({ summary, tasks, expanded, onToggle }: ProjectCardProps) => {
  const label = projectLabel(summary.name);
  const done = summary.progress === 100;
  const panelId = `project-tasks-${summary.name || 'none'}`.replace(/\s+/g, '-');

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full text-left p-5 rounded-2xl focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 truncate">{label}</h2>
          <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
        </div>

        <p className="mt-1 text-xs text-slate-500 tabular-nums">
          {summary.total} {summary.total === 1 ? 'task' : 'tasks'} · {summary.completed} completed · {summary.inProgress} in progress
        </p>

        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="font-medium text-slate-700">Progress</span>
          <span className="font-semibold text-slate-900 tabular-nums">{summary.progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={`${label} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.progress}
          className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden"
        >
          <div className={cn('h-full rounded-full', done ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${summary.progress}%` }} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs">
          {summary.overdue > 0 ? (
            <span className="font-medium text-red-600 tabular-nums">{summary.overdue} overdue</span>
          ) : (
            <span className="text-slate-400">None overdue</span>
          )}
          {summary.nextDeadline ? (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              Next
              <DueDate deadline={summary.nextDeadline} />
            </span>
          ) : (
            <span className="text-slate-400">No open deadlines</span>
          )}
        </div>
      </button>

      {expanded && (
        <ul id={panelId} className="border-t border-slate-100 divide-y divide-slate-100">
          {tasks.map(task => (
            <li key={task._id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <span className={cn('min-w-0 truncate text-sm text-slate-700', task.status === 'completed' && 'text-slate-400 line-through')}>
                {task.title}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <StatusBadge status={task.status} />
                <DueDate deadline={task.deadline} completed={task.status === 'completed'} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
};

const ProjectsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { user, logout } = useAuthGuard();
  const { tasks, loading, error, clearError } = useTasks(workspaceSlug);
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const summaries = useMemo(() => summarizeProjects(tasks), [tasks]);
  const tasksByProject = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const task of tasks) {
      const name = task.project?.trim() ?? '';
      groups.set(name, [...(groups.get(name) ?? []), task]);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => dateKeyOf(a.deadline).localeCompare(dateKeyOf(b.deadline)));
    }
    return groups;
  }, [tasks]);

  if (!user) return null;

  const hasNamedProject = summaries.some(summary => summary.name !== '');

  return (
    <Sidebar user={user} onLogout={logout}>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Projects</h1>
          <p className="text-slate-500 text-sm mt-1">Track progress of tasks grouped by project</p>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" aria-busy="true" aria-label="Loading projects">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
                <div className="h-5 w-32 bg-slate-200 rounded mb-3"></div>
                <div className="h-3 w-48 bg-slate-200 rounded mb-6"></div>
                <div className="h-1.5 w-full bg-slate-200 rounded-full mb-4"></div>
                <div className="h-4 w-24 bg-slate-200 rounded"></div>
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

            {!hasNamedProject ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <EmptyState
                  icon={<FolderKanban />}
                  title="No projects yet"
                  description="Set a Project when you create or edit a task, and tasks with the same project are grouped here with their progress."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
                {summaries.map(summary => (
                  <ProjectCard
                    key={summary.name}
                    summary={summary}
                    tasks={tasksByProject.get(summary.name) ?? []}
                    expanded={expandedName === summary.name}
                    onToggle={() => setExpandedName(current => (current === summary.name ? null : summary.name))}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Sidebar>
  );
};

export default ProjectsPage;
