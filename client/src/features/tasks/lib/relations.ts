import type { Task, TaskLinkType } from '../types';

export const MAX_TASK_RELATIONS = 50;

/** Groups of "Linked work", in display order. */
export const LINK_TYPE_ORDER: readonly TaskLinkType[] = [
  'blocks', 'blocked_by', 'relates', 'duplicates', 'duplicated_by', 'clones', 'cloned_by',
];

/** Sentence fragment that follows "this task" ("this task blocks ..."). */
export const LINK_TYPE_LABEL: Record<TaskLinkType, string> = {
  blocks: 'Blocks',
  blocked_by: 'Is blocked by',
  relates: 'Relates to',
  duplicates: 'Duplicates',
  duplicated_by: 'Is duplicated by',
  clones: 'Clones',
  cloned_by: 'Is cloned by',
};

export const LINK_TYPE_OPTIONS = LINK_TYPE_ORDER.map(value => ({ value, label: LINK_TYPE_LABEL[value] }));

export interface LinkedTask {
  type: TaskLinkType;
  task: Task;
}

export interface LinkGroup {
  type: TaskLinkType;
  items: Task[];
}

/** Every link of a task as (type, other task) pairs; links to tasks that are not loaded are skipped. */
export const linksOf = (task: Task, tasks: Task[]): LinkedTask[] => {
  const byId = new Map(tasks.map(item => [item._id, item]));
  const links: LinkedTask[] = [];
  for (const id of task.dependencies ?? []) {
    const other = byId.get(id);
    if (other) links.push({ type: 'blocked_by', task: other });
  }
  for (const other of tasks) {
    if (other._id !== task._id && other.dependencies?.includes(task._id)) links.push({ type: 'blocks', task: other });
  }
  for (const relation of task.relations ?? []) {
    const other = byId.get(relation.task);
    if (other) links.push({ type: relation.type, task: other });
  }
  return links;
};

/** Links grouped by type in display order; empty groups are left out. */
export const groupLinks = (task: Task, tasks: Task[]): LinkGroup[] => {
  const links = linksOf(task, tasks);
  return LINK_TYPE_ORDER
    .map(type => ({ type, items: links.filter(link => link.type === type).map(link => link.task) }))
    .filter(group => group.items.length > 0);
};

/** Tasks that can still be linked: not the task itself, matching the search by key or title (case-insensitive). */
export const linkCandidates = (
  task: Task,
  tasks: Task[],
  query: string,
  keyOf: (task: Task) => string,
  limit = 8,
): Task[] => {
  const needle = query.trim().toLowerCase();
  return tasks
    .filter(item => item._id !== task._id)
    .filter(item => !needle || item.title.toLowerCase().includes(needle) || keyOf(item).toLowerCase().includes(needle))
    .slice(0, limit);
};

/** Top-level, non-epic tasks a task can become a subtask of (not itself, not its current parent). */
export const parentCandidates = (task: Task, tasks: Task[], query = ''): Task[] => {
  const needle = query.trim().toLowerCase();
  return tasks.filter(item =>
    item._id !== task._id
    && item._id !== task.parent
    && !item.parent
    && item.type !== 'epic'
    && (!needle || item.title.toLowerCase().includes(needle)),
  );
};

/** Whether the task can become a subtask: not an epic and no subtasks of its own. */
export const canBecomeSubtask = (task: Task, subtaskCount: number): boolean =>
  task.type !== 'epic' && subtaskCount === 0;
