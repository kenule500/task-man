import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, FolderKanban } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, PageHeader, ProgressBar, SkeletonCards, Surface } from '@/components/ds';
import { cn } from '@/lib/utils';
import {
  DueDate, StatusBadge, dateKeyOf, summarizeProjects, useTasks,
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
  const panelId = `project-tasks-${summary.name || 'none'}`.replace(/\s+/g, '-');

  return (
    <Surface as="article" padding="none" interactive>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full rounded-2xl p-4 text-left focus-visible:outline-2 focus-visible:outline-primary sm:p-5"
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
        <ProgressBar value={summary.progress} label={`${label} progress`} className="mt-1.5" />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
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
            <li key={task._id} className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
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
    </Surface>
  );
};

const ProjectsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
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

  const hasNamedProject = summaries.some(summary => summary.name !== '');

  return (
    <AppShell>
      <PageHeader title="Projects" description="Track progress of tasks grouped by project" />

      {loading ? (
        <SkeletonCards count={3} columns="md:grid-cols-2 xl:grid-cols-3" />
      ) : (
        <>
          {error && <Alert tone="error" onDismiss={clearError}>{error}</Alert>}

          {!hasNamedProject ? (
            <Surface padding="none">
              <EmptyState
                icon={<FolderKanban />}
                title="No projects yet"
                description="Set a Project when you create or edit a task, and tasks with the same project are grouped here with their progress."
              />
            </Surface>
          ) : (
            <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
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
    </AppShell>
  );
};

export default ProjectsPage;
