import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
// Deep import: the projects index imports the tasks module back
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { TASK_TYPE_META } from '../constants';
import TaskKey from './TaskKey';
import type { Task } from '../types';

interface TaskBreadcrumbProps {
  task: Task;
  /** All workspace tasks, to find the epic and the parent. */
  tasks: Task[];
  /** Workspace slug for the project link; falls back to the project directory's. */
  workspaceSlug?: string;
  /** Opens a task in the dialog (epic and parent crumbs); they are plain text without it. */
  onOpenTask?: (task: Task) => void;
  className?: string;
}

interface Crumb {
  id: string;
  node: ReactNode;
}

const crumbClass = 'inline-flex min-h-11 min-w-0 max-w-full items-center gap-1 rounded px-1 text-xs font-medium text-slate-600 outline-none hover:text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-primary sm:min-h-6';

/**
 * `Project › Epic › Parent task › KEY` above the title of the task dialog. The project links to its page; the
 * epic and the parent open in the dialog. Long titles truncate (full text in the tooltip); on phones only the
 * nearest ancestor is shown: `… › Parent › KEY`.
 */
const TaskBreadcrumb = ({ task, tasks, workspaceSlug, onOpenTask, className }: TaskBreadcrumbProps) => {
  const directory = useProjectDirectory();
  const slug = workspaceSlug ?? directory.slug;
  const project = task.project ? directory.byName(task.project) : undefined;
  const parent = task.parent ? tasks.find(item => item._id === task.parent) : undefined;
  const epicId = task.type === 'epic' ? undefined : task.epic ?? parent?.epic;
  const epic = epicId ? tasks.find(item => item._id === epicId) : undefined;

  const taskCrumb = (target: Task, label?: string, icon?: ReactNode): ReactNode => {
    const text = (
      <>
        {icon}
        <span className="truncate" title={target.title}>{target.title}</span>
      </>
    );
    return onOpenTask ? (
      <button type="button" aria-label={label} onClick={() => onOpenTask(target)} className={cn(crumbClass, 'max-w-40 sm:max-w-48')}>
        {text}
      </button>
    ) : (
      <span className={cn(crumbClass, 'max-w-40 hover:no-underline sm:max-w-48')}>{text}</span>
    );
  };

  const crumbs: Crumb[] = [];
  if (task.project) {
    crumbs.push({
      id: 'project',
      node: project && slug ? (
        <Link to={`/${slug}/projects/${project._id}`} title={`Project: ${project.name}`} className={cn(crumbClass, 'max-w-40 sm:max-w-48')}>
          <span className="truncate">{project.name}</span>
        </Link>
      ) : (
        <span className={cn(crumbClass, 'max-w-40 hover:no-underline sm:max-w-48')} title={`Project: ${task.project}`}>
          <span className="truncate">{task.project}</span>
        </span>
      ),
    });
  }
  if (epic) crumbs.push({ id: 'epic', node: taskCrumb(epic, `Open epic ${epic.title}`, <Zap aria-hidden className={cn('size-3 shrink-0', TASK_TYPE_META.epic.text)} />) });
  if (parent) crumbs.push({ id: 'parent', node: taskCrumb(parent, `Back to parent: ${parent.title}`) });

  if (crumbs.length === 0 && typeof task.number !== 'number') return null;

  return (
    <nav aria-label="Task path" className={className}>
      <ol className="-ml-1 flex min-w-0 flex-wrap items-center gap-x-0.5">
        {crumbs.length > 1 && (
          <li aria-hidden className="flex items-center text-xs text-slate-500 sm:hidden">
            …<ChevronRight className="size-3.5 shrink-0 text-slate-400" />
          </li>
        )}
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.id}>
            {/* Phones keep only the nearest ancestor */}
            <li className={cn('flex min-w-0 items-center', index < crumbs.length - 1 && 'max-sm:hidden')}>
              {crumb.node}
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-slate-400" />
            </li>
          </Fragment>
        ))}
        {/* The task itself: its key, with the copy button */}
        <li aria-current="page" className="flex min-w-0 items-center px-1">
          <TaskKey task={task} copyable />
        </li>
      </ol>
    </nav>
  );
};

export default TaskBreadcrumb;
