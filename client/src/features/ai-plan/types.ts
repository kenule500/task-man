// Shapes of the "create a project from a document" API (server: utils/ai/plan/schema.ts and controllers/aiPlanController.ts).

export type AiPlanStatus = 'queued' | 'running' | 'ready' | 'failed' | 'created';
export type PlanLanguage = 'en' | 'fr' | 'ar';
export type PlanDestination = 'new' | 'existing';
export type PlanItemType = 'story' | 'task' | 'bug' | 'spike';
export type PlanPriority = 'low' | 'medium' | 'high';
export type PlanColor = 'blue' | 'violet' | 'rose' | 'orange' | 'amber' | 'emerald' | 'teal' | 'slate';

/** The project a plan is added to, as the server resolves it. `archived` is true when it was archived after upload. */
export interface PlanTarget {
  _id: string;
  name: string;
  key: string;
  archived: boolean;
}

export interface PlanSubtask {
  title: string;
  acceptanceCriteria: string[];
}

export interface PlanItem {
  /** Stable id inside the plan (epics point to it, edits use it). */
  ref: string;
  /** 0-based index into the plan's sprints; null = product backlog. */
  sprintIndex: number | null;
  epicRef: string | null;
  title: string;
  description: string;
  type: PlanItemType;
  priority: PlanPriority;
  /** Fibonacci estimate up to 13; null = not estimated. */
  storyPoints: number | null;
  labels: string[];
  acceptanceCriteria: string[];
  subtasks: PlanSubtask[];
}

export interface PlanEpic {
  ref: string;
  title: string;
  description: string;
}

export interface PlanSprint {
  name: string;
  goal: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
}

export interface PlanProject {
  name: string;
  key: string;
  description: string;
  color: PlanColor;
}

export interface PlanContent {
  project: PlanProject;
  sprints: PlanSprint[];
  epics: PlanEpic[];
  items: PlanItem[];
  assumptions: string[];
  risks: string[];
}

export interface PlanSource {
  fileName: string;
  mimeType: string;
  size: number;
  /** Characters of the cleaned document. */
  chars: number;
  /** Only part of the document went to the model (the plan is partial). */
  truncated: boolean;
  /** First 2,000 characters; only in the detail response. */
  preview?: string;
}

export interface PlanOptions {
  projectName: string;
  projectKey: string;
  sprintLengthWeeks: number;
  startDate: string;
  teamSize: number | null;
  extraInstructions: string;
  language: PlanLanguage;
  /** The project the plan is added to; null or absent creates a new project. */
  targetProjectId?: string | null;
}

export interface PlanCounts {
  sprints: number;
  epics: number;
  items: number;
  subtasks: number;
  criteria: number;
  points: number;
}

export interface AiPlan {
  _id: string;
  status: AiPlanStatus;
  source: PlanSource;
  options: PlanOptions;
  counts: PlanCounts | null;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** Which engine produced the plan. */
  analyzer?: 'documind' | 'ai';
  error: string;
  errorCode: string;
  projectId: string | null;
  /** Detail response: the resolved destination project, or null when it was deleted. */
  targetProject?: PlanTarget | null;
  createdBy?: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Only in the detail response, once the plan is ready. */
  plan?: PlanContent | null;
}

/** What the person chooses on the upload step. Empty values are left out of the request. */
export interface PlanUploadOptions {
  projectName: string;
  projectKey: string;
  sprintLengthWeeks: number;
  startDate: string;
  teamSize: string;
  extraInstructions: string;
  language: PlanLanguage;
  /** Where the plan goes: a new project, or a project that already exists. Absent means a new project. */
  destination?: PlanDestination;
  /** The chosen existing project; null for a new project. */
  targetProjectId?: string | null;
}

export interface CreatedFromPlan {
  project: { _id: string; name: string; key: string };
  counts: { sprints: number; epics: number; items: number; subtasks: number; tasks: number; criteria: number };
  destination?: PlanDestination;
}

/** A refusal from the API the screen reacts to. */
export interface PlanApiError {
  status: number | null;
  code: string;
  message: string;
  /** A free project name or key, on `PROJECT_NAME_TAKEN` and `PROJECT_KEY_TAKEN`. */
  suggestion: string;
}
