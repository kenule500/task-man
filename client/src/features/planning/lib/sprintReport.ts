// Sprint report: the shape the report endpoint returns and helpers to read it. Pure, no UI.
import type { Sprint } from '@/features/projects';
import type { Task, TaskStatus, TaskType, TaskUser } from '@/features/tasks';

export interface ReportItem {
  _id: string;
  number?: number;
  title: string;
  type: TaskType;
  status: TaskStatus;
  project: string;
  storyPoints: number | null;
  assignees: TaskUser[];
  completedAt: string | null;
}

export interface ReportTotal {
  count: number;
  points: number;
}

export interface SprintReport {
  sprint: Pick<Sprint, '_id' | 'project' | 'name' | 'goal' | 'startDate' | 'endDate' | 'status'> & {
    projectName: string;
    projectKey: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  summary: Record<'committed' | 'completed' | 'notCompleted' | 'added' | 'removed', ReportTotal>;
  committed: ReportItem[];
  completed: ReportItem[];
  notCompleted: ReportItem[];
  added: ReportItem[];
  removed: ReportItem[];
}

/** The items that made up the sprint at its end, as tasks the burndown can read. */
export const scopeTasksOf = (report: SprintReport): Task[] =>
  [...report.completed, ...report.notCompleted].map(item => ({
    _id: item._id,
    number: item.number,
    title: item.title,
    status: item.status,
    priority: 'medium',
    type: item.type,
    project: item.project,
    storyPoints: item.storyPoints,
    sprint: report.sprint._id,
    deadline: report.sprint.endDate,
    position: 0,
    dependencies: [],
    assignees: item.assignees,
    completedAt: item.completedAt ?? undefined,
  }));

/** Share of the work in the sprint that was finished, in whole percent (by points, else by items). */
export const deliveredPercent = (summary: SprintReport['summary']): number => {
  const done = summary.completed;
  const open = summary.notCompleted;
  const points = done.points + open.points;
  if (points > 0) return Math.round((done.points / points) * 100);
  const count = done.count + open.count;
  return count === 0 ? 0 : Math.round((done.count / count) * 100);
};

export const pointsLabel = (points: number): string => `${points} ${points === 1 ? 'pt' : 'pts'}`;
