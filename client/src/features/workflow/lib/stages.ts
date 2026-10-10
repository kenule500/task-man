// Workflow stages: board columns mapped to the three status groups. Pure helpers that mirror the server rules
// (server/src/utils/workflow.ts), so the client resolves a task's stage exactly like the API does.
import { STATUS_META, TASK_STATUSES } from '@/features/tasks/constants';
import type { Task, TaskStatus } from '@/features/tasks/types';
import { STAGE_COLORS, type StageColor, type WorkflowStage } from '../types';

export const MIN_STAGES = 1;
export const MAX_STAGES = 12;
export const MAX_STAGE_NAME = 30;
export const MAX_STAGE_KEY = 30;
export const MAX_STAGE_WIP = 999;

const GROUP_COLOR: Record<TaskStatus, StageColor> = { pending: 'slate', 'in-progress': 'blue', completed: 'emerald' };

/** Group headings: the same names as the status filters. */
export const GROUP_LABEL: Record<TaskStatus, string> = {
  pending: STATUS_META.pending.label,
  'in-progress': STATUS_META['in-progress'].label,
  completed: STATUS_META.completed.label,
};

/** What the server uses until a workspace saves its own workflow. */
export const DEFAULT_STAGES: WorkflowStage[] = [
  { key: 'todo', name: 'To do', group: 'pending', color: 'slate', wipLimit: 0 },
  { key: 'in-progress', name: 'In progress', group: 'in-progress', color: 'blue', wipLimit: 0 },
  { key: 'done', name: 'Done', group: 'completed', color: 'emerald', wipLimit: 0 },
];

/**
 * Used while the workflow is not loaded (or unavailable): one stage per status named like the status.
 * Moves made against it send `status`, not `stage`, so the API never sees these keys.
 */
export const STATUS_STAGES: WorkflowStage[] = TASK_STATUSES.map(status => ({
  key: status,
  name: STATUS_META[status].label,
  group: status,
  color: GROUP_COLOR[status],
  wipLimit: 0,
}));

interface StageColorMeta {
  label: string;
  /** Solid marker */
  dot: string;
}

/** Full class names so Tailwind finds them. */
export const STAGE_COLOR_META: Record<StageColor, StageColorMeta> = {
  slate: { label: 'Slate', dot: 'bg-slate-400' },
  blue: { label: 'Blue', dot: 'bg-blue-600' },
  violet: { label: 'Violet', dot: 'bg-violet-500' },
  amber: { label: 'Amber', dot: 'bg-warning-dot' },
  emerald: { label: 'Green', dot: 'bg-success-dot' },
  rose: { label: 'Rose', dot: 'bg-danger-dot' },
  cyan: { label: 'Cyan', dot: 'bg-cyan-500' },
};

export const firstStageOf = (stages: readonly WorkflowStage[], group: TaskStatus): WorkflowStage =>
  stages.find(stage => stage.group === group) ?? stages[0];

/**
 * The stage a task is shown in: its own stage when that still belongs to its status group, else the first stage of
 * the group (tasks written by integrations or older tasks only carry a status).
 */
export const resolveStage = (task: Pick<Task, 'status'> & { stage?: string }, stages: readonly WorkflowStage[]): WorkflowStage => {
  const own = task.stage ? stages.find(stage => stage.key === task.stage) : undefined;
  return own && own.group === task.status ? own : firstStageOf(stages, task.status);
};

/** The stage by key, or null. */
export const stageByKey = (stages: readonly WorkflowStage[], key: string | undefined | null): WorkflowStage | null =>
  stages.find(stage => stage.key === key) ?? null;

/** Stages grouped by status group, in workflow order (for grouped selects). Empty groups are left out. */
export const stagesByGroup = (stages: readonly WorkflowStage[]): { group: TaskStatus; stages: WorkflowStage[] }[] =>
  TASK_STATUSES
    .map(group => ({ group, stages: stages.filter(stage => stage.group === group) }))
    .filter(entry => entry.stages.length > 0);

/** Board columns: tasks per stage key, ordered by their manual position. */
export const groupByStage = (tasks: readonly Task[], stages: readonly WorkflowStage[]): Record<string, Task[]> => {
  const columns: Record<string, Task[]> = Object.fromEntries(stages.map(stage => [stage.key, [] as Task[]]));
  for (const task of tasks) columns[resolveStage(task, stages).key]?.push(task);
  for (const key of Object.keys(columns)) {
    columns[key].sort((a, b) => a.position - b.position || a.deadline.localeCompare(b.deadline));
  }
  return columns;
};

export interface QuickMove {
  to: WorkflowStage;
  verb: 'Start' | 'Done' | 'Next' | 'Reopen';
}

/** The one-tap phone action of a card: the next stage, or back to the first stage from the last one. */
export const quickMoveFor = (stages: readonly WorkflowStage[], current: WorkflowStage): QuickMove => {
  const index = stages.findIndex(stage => stage.key === current.key);
  const next = stages[index + 1];
  if (!next) return { to: stages[0], verb: 'Reopen' };
  if (next.group === 'completed') return { to: next, verb: 'Done' };
  return { to: next, verb: current.group === 'pending' && next.group !== 'pending' ? 'Start' : 'Next' };
};

/** The PATCH body for putting a task in `stage`: the stage when the workflow is loaded, else just its group. */
export const stagePatch = (stage: WorkflowStage, loaded: boolean): { stage: string } | { status: TaskStatus } =>
  loaded ? { stage: stage.key } : { status: stage.group };

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/** A key for a new stage: the name as a slug, made unique among `taken`. */
export const stageKeyFor = (name: string, taken: readonly string[]): string => {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_STAGE_KEY - 3) || 'stage';
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${taken.length + 1}`;
};

export interface StageProblems {
  /** Problem per stage key (name / limit) */
  byKey: Record<string, string>;
  /** Problem with the list itself (too many, a group without stages) */
  list: string | null;
}

/** Validation messages for an edited list (the server checks the same rules). */
export const validateStages = (stages: readonly WorkflowStage[]): StageProblems => {
  const byKey: Record<string, string> = {};
  let list: string | null = null;
  const names = new Set<string>();
  for (const stage of stages) {
    const name = stage.name.trim();
    if (!name) byKey[stage.key] = 'Give the stage a name.';
    else if (name.length > MAX_STAGE_NAME) byKey[stage.key] = `Use at most ${MAX_STAGE_NAME} characters.`;
    else if (names.has(name.toLowerCase())) byKey[stage.key] = 'Another stage already has this name.';
    names.add(name.toLowerCase());
    if (!byKey[stage.key] && (!Number.isInteger(stage.wipLimit) || stage.wipLimit < 0 || stage.wipLimit > MAX_STAGE_WIP)) {
      byKey[stage.key] = `The limit is a whole number from 0 to ${MAX_STAGE_WIP}.`;
    }
  }
  if (stages.length > MAX_STAGES) list = `A workflow can have at most ${MAX_STAGES} stages.`;
  else if (stages.length < MIN_STAGES) list = 'Add at least one stage.';
  else {
    const missing = TASK_STATUSES.find(group => !stages.some(stage => stage.group === group));
    if (missing) list = `Every group needs a stage: add one to "${GROUP_LABEL[missing]}".`;
  }
  return { byKey, list };
};

export const hasProblems = (problems: StageProblems): boolean => problems.list !== null || Object.keys(problems.byKey).length > 0;

/** Text of a limit field -> number; empty = 0 (no limit), NaN when invalid. */
export const parseStageLimit = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
};

export const moveItem = <T,>(items: readonly T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export interface StageTemplate {
  id: string;
  label: string;
  stages: WorkflowStage[];
}

const make = (name: string, group: TaskStatus, color: StageColor, key = stageKeyFor(name, [])): WorkflowStage => ({
  key, name, group, color, wipLimit: 0,
});

export const STAGE_TEMPLATES: StageTemplate[] = [
  {
    id: 'scrum',
    label: 'Scrum (To do, In progress, In review, QA, Done)',
    stages: [
      make('To do', 'pending', 'slate', 'todo'),
      make('In progress', 'in-progress', 'blue', 'in-progress'),
      make('In review', 'in-progress', 'violet'),
      make('QA', 'in-progress', 'amber'),
      make('Done', 'completed', 'emerald', 'done'),
    ],
  },
  {
    id: 'kanban',
    label: 'Kanban (Backlog, Ready, Doing, Review, Done)',
    stages: [
      make('Backlog', 'pending', 'slate'),
      make('Ready', 'pending', 'cyan'),
      make('Doing', 'in-progress', 'blue'),
      make('Review', 'in-progress', 'violet'),
      make('Done', 'completed', 'emerald', 'done'),
    ],
  },
  {
    id: 'simple',
    label: 'Simple (To do, In progress, Done)',
    stages: DEFAULT_STAGES,
  },
];

/** Key prefix of stages added in the editor and not saved yet (never a valid stored key). */
export const NEW_KEY_PREFIX = '~new-';

/**
 * The request for an edited list: trimmed names, final keys for the new stages (a slug of the name, unique), and the
 * moves of removed saved stages whose target survives (the server picks the first stage of the group for the others).
 */
export const prepareSave = (
  draft: readonly WorkflowStage[],
  saved: readonly WorkflowStage[],
  moves: Readonly<Record<string, string>>,
): { stages: WorkflowStage[]; moves: Record<string, string> } => {
  const savedKeys = new Set(saved.map(stage => stage.key));
  const taken = new Set(savedKeys);
  const renamed = new Map<string, string>();
  const stages = draft.map(stage => {
    const name = stage.name.trim();
    if (savedKeys.has(stage.key)) return { ...stage, name };
    const key = stageKeyFor(name, [...taken]);
    taken.add(key);
    renamed.set(stage.key, key);
    return { ...stage, key, name };
  });
  const finalKeys = new Set(stages.map(stage => stage.key));
  const kept: Record<string, string> = {};
  for (const [from, to] of Object.entries(moves)) {
    const target = renamed.get(to) ?? to;
    if (savedKeys.has(from) && !finalKeys.has(from) && finalKeys.has(target)) kept[from] = target;
  }
  return { stages, moves: kept };
};

export const isStageColor =(value: unknown): value is StageColor =>
  typeof value === 'string' && (STAGE_COLORS as readonly string[]).includes(value);
