import type { Project, Sprint } from '@/features/projects';
import { STORY_POINT_SCALE, type SelectOption } from '../constants';
import type { Task, TaskInput, TaskPriority, TaskStatus, TaskType } from '../types';
import { dateKeyOf, todayKey } from './date';

/** Select value standing for "no sprint" (the product backlog) and "no estimate". */
export const BACKLOG_VALUE = 'backlog';
export const NO_ESTIMATE_VALUE = 'none';
/** Select value standing for "no epic". */
export const NO_EPIC_VALUE = 'none';

export interface TaskFormValues {
  title: string;
  description: string;
  project: string;
  status: TaskStatus;
  /** Workflow stage key chosen in the form; '' = unchanged (the task keeps its stage or gets the first of its status). */
  stage: string;
  priority: TaskPriority;
  type: TaskType;
  /** null = not estimated */
  storyPoints: number | null;
  /** Sprint id; '' = backlog */
  sprint: string;
  /** Epic id; '' = none */
  epic: string;
  /** `YYYY-MM-DD` or empty */
  startDate: string;
  /** `YYYY-MM-DD` */
  deadline: string;
  dependencies: string[];
  labels: string[];
  /** Assignee user ids */
  assignees: string[];
}

export type TaskFormErrors = Partial<Record<'title' | 'deadline' | 'startDate', string>>;

/** Initial form values from an existing task, or blank ones merged with `defaults`. */
export const toFormValues = (task?: Task | null, defaults: Partial<TaskFormValues> = {}): TaskFormValues => ({
  title: task?.title ?? '',
  description: task?.description ?? '',
  project: task?.project ?? '',
  status: task?.status ?? 'pending',
  stage: '',
  priority: task?.priority ?? 'medium',
  type: task?.type ?? 'task',
  storyPoints: task?.storyPoints ?? null,
  sprint: task?.sprint ?? '',
  epic: task?.epic ?? '',
  startDate: task?.startDate ? dateKeyOf(task.startDate) : '',
  deadline: task ? dateKeyOf(task.deadline) : todayKey(),
  dependencies: task?.dependencies ?? [],
  labels: task?.labels ?? [],
  assignees: task?.assignees?.map(user => user._id) ?? [],
  ...defaults,
});

/** Same rules as the API, checked before submitting. */
export const validateTaskForm = (values: TaskFormValues): TaskFormErrors => {
  const errors: TaskFormErrors = {};
  if (!values.title.trim()) errors.title = 'Give the task a title.';
  if (!values.deadline) errors.deadline = 'Pick a due date.';
  if (values.startDate && values.deadline && values.startDate > values.deadline) {
    errors.startDate = 'Start date must be on or before the due date.';
  }
  return errors;
};

/**
 * API payload from the form. When editing, a sprint that did not change is left out (the server
 * refuses to re-assign a task to a completed sprint) and subtasks never send one: they follow their parent.
 */
export const toTaskInput = (values: TaskFormValues, task?: Task | null): TaskInput => {
  const input: TaskInput = {
    title: values.title.trim(),
    description: values.description.trim(),
    project: values.project.trim(),
    status: values.status,
    priority: values.priority,
    type: values.type,
    storyPoints: values.storyPoints,
    sprint: values.sprint || null,
    epic: values.epic || null,
    startDate: values.startDate || null,
    deadline: values.deadline,
    dependencies: values.dependencies,
    labels: values.labels,
    assignees: values.assignees,
  };
  if (values.stage) input.stage = values.stage;
  if (task && (task.parent || (task.sprint ?? '') === values.sprint)) delete input.sprint;
  // Subtasks inherit their parent's epic; epics are containers outside sprints and epics
  if (task?.parent) delete input.epic;
  if (values.type === 'epic') {
    input.epic = null;
    input.sprint = null;
  }
  return input;
};

/** Estimates offered in the select: the planning scale plus the task's current value when it is off-scale. */
export const storyPointOptions = (current: number | null): SelectOption<string>[] => {
  const values: number[] = [...STORY_POINT_SCALE];
  if (current !== null && !values.includes(current)) values.push(current);
  values.sort((a, b) => a - b);
  return [
    { value: NO_ESTIMATE_VALUE, label: 'Not estimated' },
    ...values.map(value => ({ value: String(value), label: `${value} ${value === 1 ? 'point' : 'points'}` })),
  ];
};

export const parseStoryPoints = (value: string): number | null => {
  if (value === NO_ESTIMATE_VALUE) return null;
  const points = Number(value);
  return Number.isInteger(points) ? points : null;
};

export const findProjectByName = (projects: Project[], name: string | undefined): Project | undefined => {
  const wanted = name?.trim();
  return wanted ? projects.find(project => project.name === wanted) : undefined;
};

const sprintLabel = (sprint: Sprint) => (sprint.status === 'active' ? `${sprint.name} (active)` : sprint.name);

/**
 * Sprints a task of `projectName` can join: the backlog plus the project's planned and active sprints.
 * The sprint the task is already in stays listed (even when completed) so the select can show it.
 */
export const sprintOptionsFor = (
  projects: Project[],
  projectName: string | undefined,
  currentSprintId = '',
): SelectOption<string>[] => {
  const project = findProjectByName(projects, projectName);
  const sprints = (project?.sprints ?? []).filter(sprint => sprint.status !== 'completed' || sprint._id === currentSprintId);
  return [
    { value: BACKLOG_VALUE, label: 'Backlog' },
    ...sprints.map(sprint => ({ value: sprint._id, label: sprint.status === 'completed' ? `${sprint.name} (completed)` : sprintLabel(sprint) })),
  ];
};

/**
 * Epics an item of `projectName` can join: those of the same project (all epics while the item has no project),
 * plus the one it is already in. Returns the options with "No epic" first.
 */
export const epicOptionsFor = (epics: Task[], projectName: string | undefined, currentEpicId = ''): SelectOption<string>[] => {
  const project = projectName?.trim() ?? '';
  const usable = epics.filter(epic => !project || (epic.project ?? '') === project || epic._id === currentEpicId);
  return [
    { value: NO_EPIC_VALUE, label: 'No epic' },
    ...usable.map(epic => ({ value: epic._id, label: epic.title })),
  ];
};

/** Whether the epic can hold items of the named project (an item without project fits any epic). */
export const epicFitsProject = (epic: Task | undefined, projectName: string | undefined): boolean => {
  const project = projectName?.trim() ?? '';
  return Boolean(epic) && (!project || (epic?.project ?? '') === project);
};

/** Whether the sprint belongs to the named project (a project change otherwise leaves the sprint). */
export const sprintBelongsTo = (projects: Project[], projectName: string | undefined, sprintId: string): boolean =>
  Boolean(findProjectByName(projects, projectName)?.sprints.some(sprint => sprint._id === sprintId));
