import type { TaskPriority, TaskStatus, TaskType, TaskUser } from '@/features/tasks/types';

export type ReleaseStatus = 'unreleased' | 'released' | 'archived';

/** Counts (or story points) per status group of the workflow. */
export interface GroupTotals {
  pending: number;
  'in-progress': number;
  completed: number;
  total: number;
}

export interface ReleaseProgress {
  counts: GroupTotals;
  points: GroupTotals;
  /** Still unreleased and past its release date. */
  overdue: boolean;
}

export interface Release {
  _id: string;
  /** Project id (tasks reference their project by name; releases by id). */
  project: string;
  name: string;
  description?: string;
  /** ISO date strings; null = not set. */
  startDate?: string | null;
  releaseDate?: string | null;
  status: ReleaseStatus;
  releasedAt?: string | null;
  progress: ReleaseProgress;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReleaseTask {
  _id: string;
  /** "WEB-12", empty for tasks without a number. */
  key: string;
  number?: number;
  title: string;
  status: TaskStatus;
  stage?: string;
  type: TaskType;
  priority: TaskPriority;
  storyPoints?: number | null;
  assignees?: TaskUser[];
  deadline: string;
  project?: string;
}

export interface ReleaseProject {
  _id: string;
  name: string;
  key?: string;
  color?: string;
  icon?: string;
}

export interface ReleaseDetail extends Omit<Release, 'project'> {
  project: ReleaseProject;
  tasks: ReleaseTask[];
}

export interface ReleaseNoteGroup {
  type: string;
  heading: string;
  items: { id: string; key: string; title: string }[];
}

export interface ReleaseNotes {
  markdown: string;
  groups: ReleaseNoteGroup[];
}

/** Dates are `YYYY-MM-DD` keys. */
export interface ReleaseInput {
  project: string;
  name: string;
  description?: string;
  startDate?: string | null;
  releaseDate?: string | null;
}

export type ReleasePatch = Partial<Omit<ReleaseInput, 'project'>> & {
  /** `archived` archives the release; `unreleased` reopens a released or archived one. */
  status?: 'archived' | 'unreleased';
};

/**
 * Where unfinished tasks go when a release is released: `undefined` leaves them in it,
 * `null` removes them from the release, an id moves them to another unreleased release.
 */
export type MoveOpenTo = string | null | undefined;
