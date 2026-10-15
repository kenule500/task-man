export const PROJECT_COLORS = ['blue', 'violet', 'rose', 'orange', 'amber', 'emerald', 'teal', 'slate'] as const;
export const PROJECT_ICONS = ['folder', 'rocket', 'code', 'megaphone', 'palette', 'bug', 'book', 'briefcase'] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];
export type ProjectIcon = (typeof PROJECT_ICONS)[number];
export type SprintStatus = 'planned' | 'active' | 'completed';

export interface Sprint {
  _id: string;
  project: string;
  name: string;
  goal?: string;
  /** ISO date strings. */
  startDate: string;
  endDate: string;
  status: SprintStatus;
  startedAt?: string;
  completedAt?: string;
  /** Story points finished when the sprint was completed (velocity). */
  completedPoints?: number;
}

export interface Project {
  _id: string;
  /** Tasks reference their project by this name (`task.project`). */
  name: string;
  /** Short code, e.g. "WEB". */
  key: string;
  description?: string;
  color: ProjectColor;
  icon: ProjectIcon;
  archived: boolean;
  sprints: Sprint[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectInput {
  name: string;
  key?: string;
  description?: string;
  color?: ProjectColor;
  icon?: ProjectIcon;
}

export type ProjectPatch = Partial<ProjectInput> & { archived?: boolean };

/** Dates are `YYYY-MM-DD` keys. */
export interface SprintInput {
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
}

export type SprintPatch = Partial<SprintInput>;

/** Where unfinished tasks go when a sprint is completed: the backlog or a planned sprint id. */
export type MoveOpenTo = 'backlog' | string;
