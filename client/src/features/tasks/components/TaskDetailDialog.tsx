import { useMemo, type ReactNode } from 'react';
import { ArrowLeft, CornerDownRight, Link2, Pencil, Trash2 } from 'lucide-react';
import { UserAvatar } from '@/components/ds';
import type { Project } from '@/features/projects';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { UploadOptions } from '../api';
import { dateKeyOf, formatDate, isOverdue } from '../lib/date';
import { getSubtasks } from '../lib/subtasks';
import type { Task, TaskPatch, TaskUser } from '../types';
import SubtaskList from './SubtaskList';
import { DueDate, PriorityIndicator, StatusBadge, StatusDot, StoryPoints, TaskTypeBadge } from './TaskBadges';
import { LabelList } from './TaskChips';
import TaskAttachments from './TaskAttachments';
import TaskComments from './TaskComments';

/** Everything the dialog can do to a task besides editing its fields. */
export interface TaskDetailActions {
  addComment: (taskId: string, text: string) => Promise<void>;
  removeComment: (taskId: string, commentId: string) => Promise<void>;
  uploadAttachment: (taskId: string, file: File, options?: UploadOptions) => Promise<void>;
  removeAttachment: (taskId: string, attachmentId: string) => Promise<void>;
  downloadAttachment: (taskId: string, attachmentId: string) => Promise<Blob>;
  /** Creates a subtask under `parent`; the subtask section is read-only without it. */
  createSubtask?: (parent: Task, title: string) => Promise<unknown>;
  /** Used to tick subtasks off; without it the checkboxes are disabled. */
  updateTask?: (taskId: string, patch: TaskPatch) => Promise<unknown>;
  /** Shows another task in the dialog (a subtask, or its parent). */
  openTask?: (task: Task) => void;
}

interface TaskDetailDialogProps {
  /** Task shown; `null` renders nothing. Pass the live task so comments and files update in place. */
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  /** All workspace tasks, to name the dependencies. */
  tasks: Task[];
  currentUser?: { _id: string; name: string } | null;
  /** Holds `tasks:write`: edit, comment and manage attachments. */
  canWrite: boolean;
  /** Holds `tasks:delete`. */
  canDelete: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  actions: TaskDetailActions;
  /** Workspace projects with their sprints, to name the task's sprint. */
  projects?: Project[];
}

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 text-sm text-slate-700">{children}</dd>
  </div>
);

/**
 * Read view of a task with its comments and attachments. Opened by clicking a task title;
 * editing the fields stays in `TaskFormDialog` (button below).
 */
const TaskDetailDialog = ({
  task, onOpenChange, tasks, currentUser, canWrite, canDelete, onEdit, onDelete, actions, projects = [],
}: TaskDetailDialogProps) => {
  // Names for ids we only know by reference (attachment uploaders)
  const userNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const user of task?.assignees ?? []) names.set(user._id, user.name);
    for (const comment of task?.comments ?? []) if (comment.author) names.set(comment.author._id, comment.author.name);
    if (currentUser) names.set(currentUser._id, currentUser.name);
    return names;
  }, [task?.assignees, task?.comments, currentUser]);

  if (!task) return null;

  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);
  const dependencies = task.dependencies
    .map(id => tasks.find(item => item._id === id))
    .filter((item): item is Task => Boolean(item));
  const taskId = task._id;
  const parent = task.parent ? tasks.find(item => item._id === task.parent) : undefined;
  const subtasks = task.parent ? [] : getSubtasks(tasks, taskId);
  const sprintName = task.sprint
    ? projects.flatMap(project => project.sprints).find(sprint => sprint._id === task.sprint)?.name ?? 'Sprint'
    : null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border border-gray-200 bg-white p-0 shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:max-w-[680px] sm:rounded-xl">
        <DialogHeader className="shrink-0 space-y-2 border-b border-gray-200 px-4 pt-5 pb-4 pr-12 sm:px-6 sm:pt-6">
          {parent && actions.openTask && (
            <button
              type="button"
              onClick={() => actions.openTask?.(parent)}
              className="-ml-1 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded px-1 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary sm:min-h-0"
            >
              <ArrowLeft className="size-4 shrink-0" aria-hidden />
              <span className="shrink-0">Back to parent</span>
              <span className="truncate font-normal text-slate-500" title={parent.title}>{parent.title}</span>
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <TaskTypeBadge type={task.type} />
            <StoryPoints points={task.storyPoints} />
            <StatusBadge status={task.status} />
            <PriorityIndicator priority={task.priority} />
            {task.project && (
              <span className="max-w-40 truncate rounded bg-slate-100 px-1.5 text-xs text-slate-600" title="Project">{task.project}</span>
            )}
          </div>
          <DialogTitle className="text-lg leading-snug font-bold text-slate-900 [overflow-wrap:anywhere]">{task.title}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Details, comments and files for this task.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Detail label="Due date"><DueDate deadline={task.deadline} completed={completed} className="text-sm" /></Detail>
            <Detail label="Start date">
              {task.startDate ? formatDate(dateKeyOf(task.startDate)) : <span className="text-slate-400">Not set</span>}
            </Detail>
            <Detail label="Schedule">
              <span className={overdue ? 'font-medium text-red-600' : undefined}>
                {completed ? 'Completed' : overdue ? 'Overdue' : 'On track'}
              </span>
            </Detail>
            {task.parent && (
              <Detail label="Parent task">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <CornerDownRight className="size-3 shrink-0 text-slate-400" aria-hidden />
                  {parent && actions.openTask ? (
                    <button
                      type="button"
                      onClick={() => actions.openTask?.(parent)}
                      className="min-w-0 rounded text-left text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      Subtask of <span className="font-medium">{parent.title}</span>
                    </button>
                  ) : (
                    <span className="truncate">Subtask of {parent?.title ?? 'another task'}</span>
                  )}
                </span>
              </Detail>
            )}
            <Detail label="Sprint">
              {sprintName ?? <span className="text-slate-400">{task.project ? 'Backlog' : 'None'}</span>}
            </Detail>
            <Detail label="Labels">
              {task.labels?.length ? <LabelList labels={task.labels} max={10} /> : <span className="text-slate-400">None</span>}
            </Detail>
            <Detail label="Assignees">
              {task.assignees?.length ? (
                <ul className="space-y-1">
                  {task.assignees.map((user: TaskUser) => (
                    <li key={user._id} className="flex items-center gap-2">
                      <UserAvatar name={user.name} src={user.avatarUrl || undefined} size="sm" className="size-6 text-[10px]" />
                      <span className="truncate">{user.name}</span>
                    </li>
                  ))}
                </ul>
              ) : <span className="text-slate-400">Nobody yet</span>}
            </Detail>
            <Detail label="Depends on">
              {dependencies.length ? (
                <ul className="space-y-1">
                  {dependencies.map(dep => (
                    <li key={dep._id} className="flex items-center gap-1.5">
                      <Link2 className="size-3 shrink-0 text-slate-400" aria-hidden />
                      <StatusDot status={dep.status} />
                      <span className="truncate" title={dep.title}>{dep.title}</span>
                    </li>
                  ))}
                </ul>
              ) : <span className="text-slate-400">Nothing</span>}
            </Detail>
          </dl>

          <section aria-label="Description">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Description</h3>
            {task.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700 [overflow-wrap:anywhere]">{task.description}</p>
            ) : (
              <p className="text-sm text-slate-400">No description.</p>
            )}
          </section>

          {!task.parent && (subtasks.length > 0 || (canWrite && actions.createSubtask)) && (
            <SubtaskList
              subtasks={subtasks}
              canWrite={canWrite}
              canDelete={canDelete}
              onAdd={actions.createSubtask ? (title => actions.createSubtask!(task, title)) : undefined}
              onToggle={actions.updateTask ? ((subtask, completed) => { void actions.updateTask?.(subtask._id, { status: completed ? 'completed' : 'pending' }); }) : undefined}
              onOpen={actions.openTask}
              onDelete={onDelete}
            />
          )}

          <TaskAttachments
            attachments={task.attachments ?? []}
            userNames={userNames}
            canWrite={canWrite}
            onUpload={(file, options) => actions.uploadAttachment(taskId, file, options)}
            onRemove={attachmentId => actions.removeAttachment(taskId, attachmentId)}
            onDownload={attachmentId => actions.downloadAttachment(taskId, attachmentId)}
          />

          <TaskComments
            comments={task.comments ?? []}
            currentUserId={currentUser?._id}
            canWrite={canWrite}
            onAdd={text => actions.addComment(taskId, text)}
            onRemove={commentId => actions.removeComment(taskId, commentId)}
          />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-3">
          <div>
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDelete(task)}
                className="h-10 gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 sm:h-9"
              >
                <Trash2 className="size-4" aria-hidden /> {task.parent ? 'Delete subtask' : 'Delete task'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {canWrite && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onEdit(task)}
                className="h-10 gap-1.5 border-gray-300 text-slate-700 sm:h-9"
              >
                <Pencil className="size-4" aria-hidden /> Edit
              </Button>
            )}
            <Button type="button" onClick={() => onOpenChange(false)} className="h-10 bg-primary text-white hover:bg-primary-hover sm:h-9">
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailDialog;
