import { z } from 'zod';
import { PROJECT_COLORS, projectKeyFrom, type ProjectColor } from '../../../models/projectModel.js';
import { addDays, isDateKey, sprintWindow } from './dates.js';
import { normalizeText } from './text.js';

// The generated project plan: its shape, the limits, and the cleaning applied to it.
// Two schemas describe the same content. The "model" one is forgiving (it trims, clips, drops what is unusable and
// accepts the model's vocabulary); the "edit" one is strict and is used for what a person sends back, which is
// rejected with a message instead of being repaired.

export const PLAN_LANGUAGES = ['en', 'fr', 'ar'] as const;
export type PlanLanguage = (typeof PLAN_LANGUAGES)[number];

export const PLAN_ITEM_TYPES = ['story', 'task', 'bug', 'spike'] as const;
export type PlanItemType = (typeof PLAN_ITEM_TYPES)[number];
export const PLAN_PRIORITIES = ['low', 'medium', 'high'] as const;
export type PlanPriority = (typeof PLAN_PRIORITIES)[number];
export const STORY_POINT_SCALE = [1, 2, 3, 5, 8, 13] as const;

export const PLAN_LIMITS = {
  sprints: 8,
  epics: 12,
  items: 120,
  subtasksPerItem: 8,
  subtasksTotal: 300,
  criteria: 6,
  labels: 5,
  notes: 12,
  title: 140,
  itemDescription: 1000,
  epicDescription: 500,
  criterion: 300,
  label: 40,
  note: 300,
  projectName: 60,
  projectDescription: 500,
  sprintName: 60,
  sprintGoal: 300,
} as const;

export interface PlanSubtask { title: string; acceptanceCriteria: string[] }
export interface PlanItem {
  ref: string;
  /** 0-based index into `sprints`; null = product backlog */
  sprintIndex: number | null;
  epicRef: string | null;
  title: string;
  description: string;
  type: PlanItemType;
  priority: PlanPriority;
  storyPoints: number | null;
  labels: string[];
  acceptanceCriteria: string[];
  subtasks: PlanSubtask[];
}
export interface PlanEpic { ref: string; title: string; description: string }
export interface PlanSprint { name: string; goal: string; startDate: string; endDate: string }
export interface PlanProject { name: string; key: string; description: string; color: ProjectColor }
export interface PlanContent {
  project: PlanProject;
  sprints: PlanSprint[];
  epics: PlanEpic[];
  items: PlanItem[];
  assumptions: string[];
  risks: string[];
}

// ----------------------------------------------------------------
// Building blocks
// ----------------------------------------------------------------
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;
const oneLine = (value: string): string => value.replace(CONTROL, '').replace(/\s+/g, ' ').trim();
const REF = /^[A-Za-z0-9_-]{1,24}$/;
const KEY = /^[A-Z0-9]{2,6}$/;

interface TextOptions { multiline?: boolean; required?: boolean }

const text = (max: number, lenient: boolean, options: TextOptions = {}) => {
  const input = lenient ? z.unknown().transform(value => (typeof value === 'string' ? value : '')) : z.string();
  const base = input.transform(options.multiline ? normalizeText : oneLine);
  const bounded = lenient ? base.transform(value => value.slice(0, max)) : base.pipe(z.string().max(max, `must be at most ${max} characters`));
  return options.required ? bounded.pipe(z.string().min(1, 'must not be empty')) : bounded;
};

const lowered = (value: unknown): string => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** Anything that is not a list counts as an empty one. */
const looseArray = z.preprocess(value => (Array.isArray(value) ? value : []), z.array(z.unknown()));

/** Entries of a list the model wrote: usable ones are kept (up to `max`), the rest is dropped. */
const forgiving = <T>(item: z.ZodType<T>, max: number) =>
  looseArray.transform(values => {
    const kept: T[] = [];
    for (const value of values) {
      if (kept.length >= max) break;
      const parsed = item.safeParse(value);
      if (parsed.success) kept.push(parsed.data);
    }
    return kept;
  });

const strings = (max: number, maxLength: number, lenient: boolean) => lenient
  ? looseArray.transform(values => {
    const kept: string[] = [];
    for (const value of values) {
      if (kept.length >= max) break;
      const clean = typeof value === 'string' ? oneLine(value).slice(0, maxLength) : '';
      if (clean) kept.push(clean);
    }
    return kept;
  })
  : z.array(text(maxLength, false, { required: true })).max(max, `at most ${max} entries`).default([]);

const typeFromModel = (value: unknown): PlanItemType => {
  const word = lowered(value);
  if (word === 'bug' || word === 'defect' || word === 'fix') return 'bug';
  if (word === 'spike' || word === 'research' || word === 'investigation') return 'spike';
  if (word === 'story' || word === 'user story' || word === 'feature') return 'story';
  return 'task';
};

const priorityFromModel = (value: unknown): PlanPriority => {
  const word = lowered(value);
  if (word === 'high' || word === 'critical' || word === 'urgent' || word === 'highest' || word === 'blocker') return 'high';
  if (word === 'low' || word === 'lowest' || word === 'minor') return 'low';
  return 'medium';
};

/** The nearest value of the Fibonacci scale up to 13; null for "not estimated". */
export const snapStoryPoints = (value: unknown): number | null => {
  const number = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) return null;
  let best: number = STORY_POINT_SCALE[0];
  // On a tie the larger value wins: estimates err on the safe side
  for (const step of STORY_POINT_SCALE) if (Math.abs(step - number) <= Math.abs(best - number)) best = step;
  return best;
};

const integerOrNull = (value: unknown): number | null => {
  const number = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof number === 'number' && Number.isInteger(number) ? number : null;
};

const cleanKey = (value: unknown): string => {
  const key = typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '';
  return KEY.test(key) ? key : '';
};

const dateOrEmpty = (value: unknown): string => (isDateKey(value) ? value : '');

// ----------------------------------------------------------------
// The two schemas
// ----------------------------------------------------------------
const buildPlanSchema = (lenient: boolean) => {
  const line = (max: number, required = false) => text(max, lenient, { required });
  const block = (max: number) => text(max, lenient, { multiline: true });

  const subtask = z.object({
    title: line(PLAN_LIMITS.title, true),
    acceptanceCriteria: strings(PLAN_LIMITS.criteria, PLAN_LIMITS.criterion, lenient),
  });

  const ref = lenient
    ? z.unknown().optional().transform(value => (typeof value === 'string' && REF.test(value.trim()) ? value.trim() : ''))
    : z.string().trim().regex(REF, 'must be 1 to 24 letters, digits, - or _');

  const epic = z.object({
    ref,
    title: line(PLAN_LIMITS.title, true),
    description: block(PLAN_LIMITS.epicDescription).default(''),
  });

  const label = z.string().transform(oneLine).pipe(z.string().min(1).max(PLAN_LIMITS.label));
  const labels = lenient
    ? looseArray.transform(values => {
      const seen = new Set<string>();
      const kept: string[] = [];
      for (const value of values) {
        if (kept.length >= PLAN_LIMITS.labels) break;
        const parsed = label.safeParse(value);
        if (parsed.success && !seen.has(parsed.data.toLowerCase())) {
          seen.add(parsed.data.toLowerCase());
          kept.push(parsed.data);
        }
      }
      return kept;
    })
    : z.array(label).max(PLAN_LIMITS.labels, `at most ${PLAN_LIMITS.labels} labels`).default([])
      .refine(values => new Set(values.map(value => value.toLowerCase())).size === values.length, 'labels must be different');

  const itemShape = {
    ref,
    title: line(PLAN_LIMITS.title, true),
    description: block(PLAN_LIMITS.itemDescription).default(''),
    labels,
    acceptanceCriteria: strings(PLAN_LIMITS.criteria, PLAN_LIMITS.criterion, lenient),
    subtasks: lenient ? forgiving(subtask, PLAN_LIMITS.subtasksPerItem) : z.array(subtask).max(PLAN_LIMITS.subtasksPerItem, `at most ${PLAN_LIMITS.subtasksPerItem} subtasks`).default([]),
  };

  const item = lenient
    ? z.object({
      ...itemShape,
      // The model counts sprints from 1; the stored plan counts from 0
      sprint: z.unknown().optional(),
      sprintIndex: z.unknown().optional(),
      epic: z.unknown().optional(),
      epicRef: z.unknown().optional(),
      type: z.unknown().optional(),
      priority: z.unknown().optional(),
      storyPoints: z.unknown().optional(),
    }).transform((value): PlanItem => {
      const oneBased = integerOrNull(value.sprint);
      const zeroBased = integerOrNull(value.sprintIndex);
      const epicRef = typeof (value.epicRef ?? value.epic) === 'string' ? String(value.epicRef ?? value.epic).trim() : '';
      return {
        ref: value.ref,
        sprintIndex: zeroBased ?? (oneBased !== null ? oneBased - 1 : null),
        epicRef: REF.test(epicRef) ? epicRef : null,
        title: value.title,
        description: value.description,
        type: typeFromModel(value.type),
        priority: priorityFromModel(value.priority),
        storyPoints: snapStoryPoints(value.storyPoints),
        labels: value.labels,
        acceptanceCriteria: value.acceptanceCriteria,
        subtasks: value.subtasks,
      };
    })
    : z.object({
      ...itemShape,
      sprintIndex: z.number().int().min(0).max(PLAN_LIMITS.sprints - 1).nullable(),
      epicRef: z.string().trim().regex(REF).nullable().default(null),
      type: z.enum(PLAN_ITEM_TYPES),
      priority: z.enum(PLAN_PRIORITIES),
      storyPoints: z.number().refine(value => (STORY_POINT_SCALE as readonly number[]).includes(value), 'must be 1, 2, 3, 5, 8 or 13').nullable(),
    });

  const sprint = z.object({
    name: line(PLAN_LIMITS.sprintName, true),
    goal: block(PLAN_LIMITS.sprintGoal).default(''),
    startDate: lenient
      ? z.unknown().optional().transform(dateOrEmpty)
      : z.string().refine(isDateKey, 'must be a date like 2030-01-31'),
    endDate: lenient
      ? z.unknown().optional().transform(dateOrEmpty)
      : z.string().refine(isDateKey, 'must be a date like 2030-01-31'),
  });

  const project = z.object({
    name: line(PLAN_LIMITS.projectName, true),
    key: lenient
      ? z.unknown().optional().transform(cleanKey)
      : z.string().trim().toUpperCase().regex(KEY, 'must be 2 to 6 letters or digits'),
    description: block(PLAN_LIMITS.projectDescription).default(''),
    color: lenient
      ? z.unknown().optional().transform((value): ProjectColor => {
        const word = lowered(value);
        return (PROJECT_COLORS as readonly string[]).includes(word) ? word as ProjectColor : 'blue';
      })
      : z.enum(PROJECT_COLORS),
  });

  const list = <T extends z.ZodType>(entry: T, max: number, label: string): z.ZodType<z.output<T>[]> => (lenient
    ? forgiving(entry, max)
    : z.array(entry).max(max, `at most ${max} ${label}`)) as z.ZodType<z.output<T>[]>;

  return z.object({
    project,
    sprints: list(sprint, PLAN_LIMITS.sprints, 'sprints'),
    epics: list(epic, PLAN_LIMITS.epics, 'epics'),
    items: list(item, PLAN_LIMITS.items, 'items').refine(entries => entries.length > 0, 'the plan needs at least one item'),
    assumptions: strings(PLAN_LIMITS.notes, PLAN_LIMITS.note, lenient),
    risks: strings(PLAN_LIMITS.notes, PLAN_LIMITS.note, lenient),
  });
};

/** What the model returns: forgiving, in the model's vocabulary (`sprint` counted from 1). */
export const modelPlanSchema = buildPlanSchema(true) as unknown as z.ZodType<PlanContent>;
/** What a person sends back when editing the plan: strict. */
export const editedPlanSchema = buildPlanSchema(false) as unknown as z.ZodType<PlanContent>;

/** Short, safe-to-show description of why an edited plan was refused. */
export const describePlanProblem = (error: z.ZodError): string =>
  error.issues.slice(0, 3).map(issue => `${issue.path.join('.') || 'plan'}: ${issue.message}`).join('; ');

// ----------------------------------------------------------------
// Making a plan consistent
// ----------------------------------------------------------------
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A project key nobody in the workspace uses yet: `WEB` becomes `WEBA`, `WEBB`... */
export const uniqueKey = (key: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(key)) return key;
  for (const length of [1, 2]) {
    const base = key.slice(0, 6 - length);
    const count = LETTERS.length ** length;
    for (let n = 0; n < count; n += 1) {
      let suffix = '';
      for (let digit = 0, rest = n; digit < length; digit += 1, rest = Math.floor(rest / LETTERS.length)) suffix = LETTERS[rest % LETTERS.length] + suffix;
      const candidate = `${base}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
  return key;
};

/** A project name nobody in the workspace uses yet: `Shop` becomes `Shop (2)`. `taken` holds lower-case names. */
export const uniqueName = (name: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; n < 100; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${name.slice(0, PLAN_LIMITS.projectName - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return name;
};

export interface FinalizeContext {
  /** First day of the first sprint, YYYY-MM-DD */
  startDate: string;
  sprintLengthWeeks: number;
  /** Keep the sprint dates of the content (an edit by a person); otherwise they are computed from `startDate`. */
  keepDates?: boolean;
  /** Name and key the requester chose; they win over what the model proposed. */
  projectName?: string;
  projectKey?: string;
  /** Keys and lower-case names already used in the workspace; the plan is given a free one. */
  takenKeys?: ReadonlySet<string>;
  takenNames?: ReadonlySet<string>;
}

const uniqueRefs = <T extends { ref: string }>(entries: T[], prefix: string, used: Set<string>): T[] =>
  entries.map((entry, index) => {
    let ref = entry.ref;
    if (!ref || used.has(ref.toLowerCase())) {
      ref = `${prefix}${index + 1}`;
      for (let n = index + 1; used.has(ref.toLowerCase()); n += 1) ref = `${prefix}${n + 1}`;
    }
    used.add(ref.toLowerCase());
    return { ...entry, ref };
  });

/**
 * Applies the rules that need the whole plan: counts, references that point somewhere, sprint dates, free name and key.
 * Idempotent, so it can run on a generated plan, on an edited one, and again when the project is created.
 */
export const finalizePlan = (content: PlanContent, context: FinalizeContext): PlanContent => {
  const weeks = Math.min(4, Math.max(1, Math.trunc(context.sprintLengthWeeks) || 2));

  const sprints = content.sprints.slice(0, PLAN_LIMITS.sprints).map((sprint, index): PlanSprint => {
    const computed = sprintWindow(context.startDate, weeks, index);
    const valid = context.keepDates && isDateKey(sprint.startDate) && isDateKey(sprint.endDate) && sprint.endDate >= sprint.startDate;
    return { name: sprint.name || `Sprint ${index + 1}`, goal: sprint.goal, ...(valid ? { startDate: sprint.startDate, endDate: sprint.endDate } : computed) };
  });

  const used = new Set<string>();
  const epics = uniqueRefs(content.epics.slice(0, PLAN_LIMITS.epics), 'E', used);
  const epicRefs = new Set(epics.map(epic => epic.ref));

  let subtasksLeft: number = PLAN_LIMITS.subtasksTotal;
  const items = uniqueRefs(content.items.slice(0, PLAN_LIMITS.items), 'T', used).map((item): PlanItem => {
    const subtasks = item.subtasks.slice(0, Math.min(PLAN_LIMITS.subtasksPerItem, subtasksLeft)).map(subtask => ({
      title: subtask.title,
      acceptanceCriteria: subtask.acceptanceCriteria.slice(0, PLAN_LIMITS.criteria),
    }));
    subtasksLeft -= subtasks.length;
    return {
      ...item,
      sprintIndex: item.sprintIndex !== null && item.sprintIndex >= 0 && item.sprintIndex < sprints.length ? item.sprintIndex : null,
      epicRef: item.epicRef !== null && epicRefs.has(item.epicRef) ? item.epicRef : null,
      labels: item.labels.slice(0, PLAN_LIMITS.labels),
      acceptanceCriteria: item.acceptanceCriteria.slice(0, PLAN_LIMITS.criteria),
      subtasks,
    };
  });

  const requestedName = context.projectName?.trim() ? oneLine(context.projectName).slice(0, PLAN_LIMITS.projectName) : '';
  const name = requestedName || content.project.name || 'New project';
  const requestedKey = cleanKey(context.projectKey);
  const key = requestedKey || (KEY.test(content.project.key) ? content.project.key : projectKeyFrom(name));

  return {
    project: {
      name: context.takenNames ? uniqueName(name, context.takenNames) : name,
      key: context.takenKeys ? uniqueKey(key, context.takenKeys) : key,
      description: content.project.description,
      color: content.project.color,
    },
    sprints,
    epics,
    items,
    assumptions: content.assumptions.slice(0, PLAN_LIMITS.notes),
    risks: content.risks.slice(0, PLAN_LIMITS.notes),
  };
};

export interface PlanCounts { sprints: number; epics: number; items: number; subtasks: number; criteria: number; points: number }

export const countPlan = (plan: PlanContent): PlanCounts => ({
  sprints: plan.sprints.length,
  epics: plan.epics.length,
  items: plan.items.length,
  subtasks: plan.items.reduce((sum, item) => sum + item.subtasks.length, 0),
  criteria: plan.items.reduce((sum, item) => sum + item.acceptanceCriteria.length + item.subtasks.reduce((inner, subtask) => inner + subtask.acceptanceCriteria.length, 0), 0),
  points: plan.items.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0),
});

/** Last day any sprint of the plan ends; the plan's own span when it has no sprint. */
export const planEndDate = (plan: PlanContent, startDate: string, weeks: number): string =>
  plan.sprints.reduce((latest, sprint) => (sprint.endDate > latest ? sprint.endDate : latest), addDays(startDate, weeks * 7 - 1));
