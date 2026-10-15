// Workflow stages: workspace-defined board columns, each mapped to one of the three status groups.
// `status` stays the group (reports, burndown, flow and integrations only know the groups); a task's
// `stage` is the finer column. Pure helpers, shared by the controllers and unit tested.
import { TASK_STATUSES, type TaskStatus } from '../models/taskModel.js';

export const STAGE_COLORS = ['slate', 'blue', 'violet', 'amber', 'emerald', 'rose', 'cyan'] as const;
export type StageColor = (typeof STAGE_COLORS)[number];

export const MIN_STAGES = 1;
export const MAX_STAGES = 12;
export const MAX_STAGE_NAME = 30;
export const MAX_STAGE_KEY = 30;
export const MAX_STAGE_WIP = 999;

export interface WorkflowStage {
  key: string;
  name: string;
  group: TaskStatus;
  color: StageColor;
  // 0 = no limit
  wipLimit: number;
}

export const STAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const GROUP_COLOR: Record<TaskStatus, StageColor> = { pending: 'slate', 'in-progress': 'blue', completed: 'emerald' };

export const defaultWorkflow = (): WorkflowStage[] => [
  { key: 'todo', name: 'To do', group: 'pending', color: GROUP_COLOR.pending, wipLimit: 0 },
  { key: 'in-progress', name: 'In progress', group: 'in-progress', color: GROUP_COLOR['in-progress'], wipLimit: 0 },
  { key: 'done', name: 'Done', group: 'completed', color: GROUP_COLOR.completed, wipLimit: 0 },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type WorkflowCheck = { ok: true; stages: WorkflowStage[] } | { ok: false; error: string };

/** Checks a requested stage list and returns it normalised (trimmed names, defaults for color and limit). */
export const validateWorkflow = (input: unknown): WorkflowCheck => {
  if (!Array.isArray(input)) return { ok: false, error: 'Stages must be a list' };
  if (input.length < MIN_STAGES) return { ok: false, error: 'A workflow needs at least one stage' };
  if (input.length > MAX_STAGES) return { ok: false, error: `A workflow can have at most ${MAX_STAGES} stages` };

  const stages: WorkflowStage[] = [];
  const keys = new Set<string>();
  for (const [index, raw] of input.entries()) {
    const label = `Stage ${index + 1}`;
    if (!isRecord(raw)) return { ok: false, error: `${label} must be an object` };
    const key = typeof raw.key === 'string' ? raw.key.trim() : '';
    if (key.length === 0 || key.length > MAX_STAGE_KEY || !STAGE_KEY_PATTERN.test(key)) {
      return { ok: false, error: `${label} needs a key of lowercase letters, numbers and dashes (up to ${MAX_STAGE_KEY})` };
    }
    if (keys.has(key)) return { ok: false, error: `Stage keys must be unique ("${key}" is used twice)` };
    keys.add(key);

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (name.length === 0) return { ok: false, error: `${label} needs a name` };
    if (name.length > MAX_STAGE_NAME) return { ok: false, error: `Stage names can be at most ${MAX_STAGE_NAME} characters` };

    if (typeof raw.group !== 'string' || !(TASK_STATUSES as readonly string[]).includes(raw.group)) {
      return { ok: false, error: `"${name}" needs a group: pending, in-progress or completed` };
    }
    const group = raw.group as TaskStatus;

    let color: StageColor = GROUP_COLOR[group];
    if (raw.color !== undefined) {
      if (typeof raw.color !== 'string' || !(STAGE_COLORS as readonly string[]).includes(raw.color)) {
        return { ok: false, error: `"${name}" has an unknown color` };
      }
      color = raw.color as StageColor;
    }

    let wipLimit = 0;
    if (raw.wipLimit !== undefined && raw.wipLimit !== null) {
      if (typeof raw.wipLimit !== 'number' || !Number.isInteger(raw.wipLimit) || raw.wipLimit < 0 || raw.wipLimit > MAX_STAGE_WIP) {
        return { ok: false, error: `The limit of "${name}" must be a whole number from 0 to ${MAX_STAGE_WIP}` };
      }
      wipLimit = raw.wipLimit;
    }

    stages.push({ key, name, group, color, wipLimit });
  }

  for (const group of TASK_STATUSES) {
    if (!stages.some(stage => stage.group === group)) {
      return { ok: false, error: `Every group needs at least one stage (${group} has none)` };
    }
  }
  return { ok: true, stages };
};

/** First stage of a group (every valid workflow has one). */
export const firstStageOf = (stages: readonly WorkflowStage[], group: TaskStatus): WorkflowStage =>
  stages.find(stage => stage.group === group) ?? stages[0];

export interface StageChange {
  // Explicit stage key: wins over `status` and sets the status to its group
  stage?: string | null;
  status?: TaskStatus | null;
  // What the task has today
  currentStage?: string | null;
  currentStatus?: TaskStatus | null;
}

export interface ResolvedStage {
  stage: string;
  status: TaskStatus;
}

/**
 * The stage and status to store. An explicit stage wins (null when it is unknown); a status-only change keeps
 * the current stage if it belongs to that group, else takes the first stage of the group. Without either, a stale
 * or empty current stage falls back to the first stage of the current status group.
 */
export const stageFor = (stages: readonly WorkflowStage[], change: StageChange): ResolvedStage | null => {
  if (change.stage) {
    const stage = stages.find(item => item.key === change.stage);
    return stage ? { stage: stage.key, status: stage.group } : null;
  }
  const status = change.status ?? change.currentStatus ?? 'pending';
  const current = change.currentStage ? stages.find(item => item.key === change.currentStage) : undefined;
  const stage = current && current.group === status ? current : firstStageOf(stages, status);
  return { stage: stage.key, status };
};

interface WorkflowSource {
  workflow?: { stages?: ArrayLike<Partial<WorkflowStage>> | null } | null;
  boardSettings?: { wipLimits?: Partial<Record<TaskStatus, number | null>> | null } | null;
}

/**
 * The workspace's stages in order. A workspace without a custom workflow gets the default one; a stage without a
 * limit that is the only stage of its group takes the old per-status board limit.
 */
export const workflowOf = (workspace: WorkflowSource): WorkflowStage[] => {
  const stored = workspace.workflow?.stages ? Array.from(workspace.workflow.stages) : [];
  const stages: WorkflowStage[] = stored.length > 0
    ? stored.map(stage => ({
      key: String(stage.key),
      name: String(stage.name),
      group: stage.group as TaskStatus,
      color: (stage.color ?? GROUP_COLOR[stage.group as TaskStatus] ?? 'slate') as StageColor,
      wipLimit: stage.wipLimit ?? 0,
    }))
    : defaultWorkflow();
  const legacy = workspace.boardSettings?.wipLimits;
  if (!legacy) return stages;
  return stages.map(stage => {
    const old = legacy[stage.group];
    const alone = stages.filter(item => item.group === stage.group).length === 1;
    return stage.wipLimit === 0 && alone && typeof old === 'number' && old > 0 ? { ...stage, wipLimit: old } : stage;
  });
};

/** Why a stage change is rejected, for the 400 message. */
export const UNKNOWN_STAGE_MESSAGE = 'Unknown stage';

/** Tasks of removed stages go to `moves[key]` when that stage survives, else to the first stage of their group. */
export const planStageMoves = (
  before: readonly WorkflowStage[],
  after: readonly WorkflowStage[],
  moves: Record<string, unknown> = {},
): { from: string; to: string }[] => {
  const kept = new Set(after.map(stage => stage.key));
  return before
    .filter(stage => !kept.has(stage.key))
    .map(stage => {
      const requested = moves[stage.key];
      const target = typeof requested === 'string' ? after.find(item => item.key === requested) : undefined;
      return { from: stage.key, to: (target ?? firstStageOf(after, stage.group)).key };
    });
};
