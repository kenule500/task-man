import type { PlanContent, PlanCounts, PlanItem, PlanItemType, PlanPriority, PlanProject, PlanSprint, PlanSubtask } from '../types';

// Pure helpers to read and edit a generated plan. Every edit returns a new plan (nothing is mutated), so the screen
// can keep the previous one for "Undo". The limits mirror the server (utils/ai/plan/schema.ts), which checks them again.

export const PLAN_LIMITS = {
  items: 120,
  subtasksPerItem: 8,
  subtasksTotal: 300,
  criteria: 6,
  title: 140,
  description: 1000,
  criterion: 300,
  sprintName: 60,
  sprintGoal: 300,
  projectName: 60,
  projectDescription: 500,
} as const;

export const STORY_POINT_VALUES = [1, 2, 3, 5, 8, 13] as const;
export const ITEM_TYPES: PlanItemType[] = ['story', 'task', 'bug', 'spike'];
export const PRIORITIES: PlanPriority[] = ['low', 'medium', 'high'];

export const KEY_PATTERN = /^[A-Z0-9]{2,6}$/;

export const isValidKey = (key: string): boolean => KEY_PATTERN.test(key);

/** Letters and digits only, upper case, at most six: what the project key field accepts as the person types. */
export const cleanKey = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

// ----------------------------------------------------------------
// Reading
// ----------------------------------------------------------------
export interface SprintGroup {
  /** Index into `plan.sprints`; null = the backlog. */
  sprintIndex: number | null;
  sprint: PlanSprint | null;
  items: PlanItem[];
  points: number;
}

export const itemPoints = (item: PlanItem): number => item.storyPoints ?? 0;

/** The items of every sprint in order, then the backlog (always present, even when empty). */
export const groupBySprint = (plan: PlanContent): SprintGroup[] => {
  const groups: SprintGroup[] = plan.sprints.map((sprint, sprintIndex) => ({ sprintIndex, sprint, items: [], points: 0 }));
  const backlog: SprintGroup = { sprintIndex: null, sprint: null, items: [], points: 0 };
  for (const item of plan.items) {
    const group = item.sprintIndex !== null ? groups[item.sprintIndex] ?? backlog : backlog;
    group.items.push(item);
    group.points += itemPoints(item);
  }
  return [...groups, backlog];
};

export const countSubtasks = (plan: PlanContent): number => plan.items.reduce((sum, item) => sum + item.subtasks.length, 0);

export const countCriteria = (plan: PlanContent): number =>
  plan.items.reduce((sum, item) => sum + item.acceptanceCriteria.length + item.subtasks.reduce((inner, subtask) => inner + subtask.acceptanceCriteria.length, 0), 0);

export const totals = (plan: PlanContent): PlanCounts => ({
  sprints: plan.sprints.length,
  epics: plan.epics.length,
  items: plan.items.length,
  subtasks: countSubtasks(plan),
  criteria: countCriteria(plan),
  points: plan.items.reduce((sum, item) => sum + itemPoints(item), 0),
});

/** Items that have no acceptance criteria (the plan is meant to give every item some). */
export const itemsWithoutCriteria = (plan: PlanContent): number => plan.items.filter(item => item.acceptanceCriteria.length === 0).length;

/** First and last week (1-based) of the `index`-th sprint, for the "Weeks 3–4" label. */
export const weekRange = (index: number, sprintLengthWeeks: number): { from: number; to: number } => ({
  from: index * sprintLengthWeeks + 1,
  to: (index + 1) * sprintLengthWeeks,
});

const refs = (plan: PlanContent): Set<string> => new Set([...plan.items.map(item => item.ref), ...plan.epics.map(epic => epic.ref)]);

// ----------------------------------------------------------------
// Editing
// ----------------------------------------------------------------
export const updateProject = (plan: PlanContent, patch: Partial<PlanProject>): PlanContent => ({ ...plan, project: { ...plan.project, ...patch } });

export const updateSprint = (plan: PlanContent, index: number, patch: Partial<Pick<PlanSprint, 'name' | 'goal'>>): PlanContent => ({
  ...plan,
  sprints: plan.sprints.map((sprint, position) => (position === index ? { ...sprint, ...patch } : sprint)),
});

export const updateItem = (plan: PlanContent, ref: string, patch: Partial<PlanItem>): PlanContent => ({
  ...plan,
  items: plan.items.map(item => (item.ref === ref ? { ...item, ...patch } : item)),
});

/** Moves an item (and with it its subtasks) to a sprint, or to the backlog with `null`. */
export const moveItem = (plan: PlanContent, ref: string, sprintIndex: number | null): PlanContent =>
  updateItem(plan, ref, { sprintIndex: sprintIndex !== null && sprintIndex >= 0 && sprintIndex < plan.sprints.length ? sprintIndex : null });

export const removeItem = (plan: PlanContent, ref: string): PlanContent => ({ ...plan, items: plan.items.filter(item => item.ref !== ref) });

export const canAddItem = (plan: PlanContent): boolean => plan.items.length < PLAN_LIMITS.items;

/** A reference that no item or epic of the plan uses yet ("N1", "N2"...). */
export const newRef = (plan: PlanContent): string => {
  const used = refs(plan);
  let n = plan.items.length + 1;
  while (used.has(`N${n}`)) n += 1;
  return `N${n}`;
};

export const addItem = (plan: PlanContent, sprintIndex: number | null, title: string): PlanContent => {
  if (!canAddItem(plan)) return plan;
  const item: PlanItem = {
    ref: newRef(plan),
    sprintIndex: sprintIndex !== null && sprintIndex < plan.sprints.length ? sprintIndex : null,
    epicRef: null,
    title: title.trim().slice(0, PLAN_LIMITS.title),
    description: '',
    type: 'task',
    priority: 'medium',
    storyPoints: null,
    labels: [],
    acceptanceCriteria: [],
    subtasks: [],
  };
  return { ...plan, items: [...plan.items, item] };
};

export const canAddSubtask = (plan: PlanContent, ref: string): boolean => {
  const item = plan.items.find(entry => entry.ref === ref);
  return Boolean(item) && (item?.subtasks.length ?? 0) < PLAN_LIMITS.subtasksPerItem && countSubtasks(plan) < PLAN_LIMITS.subtasksTotal;
};

export const addSubtask = (plan: PlanContent, ref: string, title: string): PlanContent => {
  if (!canAddSubtask(plan, ref)) return plan;
  const subtask: PlanSubtask = { title: title.trim().slice(0, PLAN_LIMITS.title), acceptanceCriteria: [] };
  return updateItem(plan, ref, { subtasks: [...(plan.items.find(item => item.ref === ref)?.subtasks ?? []), subtask] });
};

const mapSubtasks = (plan: PlanContent, ref: string, change: (subtasks: PlanSubtask[]) => PlanSubtask[]): PlanContent => {
  const item = plan.items.find(entry => entry.ref === ref);
  return item ? updateItem(plan, ref, { subtasks: change(item.subtasks) }) : plan;
};

export const updateSubtask = (plan: PlanContent, ref: string, index: number, patch: Partial<PlanSubtask>): PlanContent =>
  mapSubtasks(plan, ref, subtasks => subtasks.map((subtask, position) => (position === index ? { ...subtask, ...patch } : subtask)));

export const removeSubtask = (plan: PlanContent, ref: string, index: number): PlanContent =>
  mapSubtasks(plan, ref, subtasks => subtasks.filter((_, position) => position !== index));

/** A list with the entry at `index` replaced (or removed with `null`), kept inside the criteria limit. */
export const editList = (list: string[], index: number, value: string | null): string[] => {
  if (value === null) return list.filter((_, position) => position !== index);
  return list.map((entry, position) => (position === index ? value.slice(0, PLAN_LIMITS.criterion) : entry));
};

export const addToList = (list: string[], value: string): string[] =>
  list.length >= PLAN_LIMITS.criteria ? list : [...list, value.trim().slice(0, PLAN_LIMITS.criterion)];

// ----------------------------------------------------------------
// Checking before the project is created
// ----------------------------------------------------------------
export type PlanProblem =
  | { kind: 'projectName' }
  | { kind: 'projectKey' }
  | { kind: 'noItems' }
  | { kind: 'itemTitle'; ref: string }
  | { kind: 'subtaskTitle'; ref: string; index: number }
  | { kind: 'criterion'; ref: string }
  | { kind: 'sprintName'; index: number };

/** Edits the server would refuse: blank names and titles, a bad key, no items. Empty criteria are dropped by `tidyPlan`. */
export const planProblems = (plan: PlanContent): PlanProblem[] => {
  const problems: PlanProblem[] = [];
  if (plan.project.name.trim() === '') problems.push({ kind: 'projectName' });
  if (!isValidKey(plan.project.key)) problems.push({ kind: 'projectKey' });
  if (plan.items.length === 0) problems.push({ kind: 'noItems' });
  plan.sprints.forEach((sprint, index) => { if (sprint.name.trim() === '') problems.push({ kind: 'sprintName', index }); });
  for (const item of plan.items) {
    if (item.title.trim() === '') problems.push({ kind: 'itemTitle', ref: item.ref });
    item.subtasks.forEach((subtask, index) => { if (subtask.title.trim() === '') problems.push({ kind: 'subtaskTitle', ref: item.ref, index }); });
  }
  return problems;
};

const tidyList = (list: string[]): string[] => list.map(entry => entry.trim()).filter(Boolean).slice(0, PLAN_LIMITS.criteria);

/** The plan as it is sent: trimmed text, empty criteria removed. */
export const tidyPlan = (plan: PlanContent): PlanContent => ({
  ...plan,
  project: { ...plan.project, name: plan.project.name.trim(), description: plan.project.description.trim() },
  sprints: plan.sprints.map(sprint => ({ ...sprint, name: sprint.name.trim(), goal: sprint.goal.trim() })),
  items: plan.items.map(item => ({
    ...item,
    title: item.title.trim(),
    description: item.description.trim(),
    acceptanceCriteria: tidyList(item.acceptanceCriteria),
    subtasks: item.subtasks.map(subtask => ({ title: subtask.title.trim(), acceptanceCriteria: tidyList(subtask.acceptanceCriteria) })),
  })),
});
