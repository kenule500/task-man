/** Shapes of `GET /api/workspaces/:slug/reports/flow` (see server/src/controllers/flowController.ts). */

export type FlowStatusKey = 'pending' | 'inProgress' | 'completed';

/** Tasks per status at the end of one UTC day (`date` is YYYY-MM-DD). */
export interface CfdDay extends Record<FlowStatusKey, number> {
  date: string;
}

export interface TimePoint {
  taskId: string;
  /** Display key such as "WEB-12" ('' when the task has no number). */
  key: string;
  title: string;
  /** ISO timestamp of the last completion. */
  completedAt: string;
  days: number;
}

export interface TimeStats {
  count: number;
  average: number | null;
  p50: number | null;
  p85: number | null;
  p95: number | null;
  points: TimePoint[];
}

export interface AgingAssignee {
  _id: string;
  name: string;
  avatarUrl?: string;
}

export interface AgingItem {
  taskId: string;
  key: string;
  title: string;
  project: string;
  assignees: AgingAssignee[];
  /** ISO timestamp the task last entered in-progress. */
  since: string;
  days: number;
}

export interface ThroughputWeek {
  /** ISO week label, e.g. 2026-W41. */
  week: string;
  /** Monday of the week (YYYY-MM-DD). */
  start: string;
  count: number;
}

export interface FlowReport {
  range: { from: string; to: string; days: number };
  cfd: CfdDay[];
  cycleTime: TimeStats;
  leadTime: TimeStats;
  aging: AgingItem[];
  throughput: ThroughputWeek[];
}

export interface FlowParams {
  /** Project name; empty or undefined = every project. */
  project?: string;
  /** Sprint id; empty or undefined = every sprint. */
  sprint?: string;
  from: string;
  to: string;
}
