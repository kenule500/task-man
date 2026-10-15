import type { TaskStatus } from '@/features/tasks/types';

export const STAGE_COLORS = ['slate', 'blue', 'violet', 'amber', 'emerald', 'rose', 'cyan'] as const;
export type StageColor = (typeof STAGE_COLORS)[number];

/** One board column. `group` is the task status every task in the stage has. */
export interface WorkflowStage {
  /** Lowercase letters, numbers and dashes (up to 30); never changes once saved. */
  key: string;
  name: string;
  group: TaskStatus;
  color: StageColor;
  /** 0 = no limit */
  wipLimit: number;
}

/** Mirrors PUT /workspaces/:slug/workflow. */
export interface WorkflowUpdate {
  stages: WorkflowStage[];
  /** removed stage key -> stage that receives its tasks (default: first stage of the same group) */
  moves?: Record<string, string>;
}
