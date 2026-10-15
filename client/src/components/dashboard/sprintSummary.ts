import type { Project, Sprint } from '@/features/projects';
import { dateKeyOf, toDateKey, type Task } from '@/features/tasks';

export interface ActiveSprintSummary {
  project: Project;
  sprint: Sprint;
  /** Top-level work items in the sprint (subtasks are part of their parent). */
  total: number;
  completed: number;
  points: number;
  completedPoints: number;
  /** 0–100, by story points when the sprint is estimated, otherwise by item count. */
  progress: number;
  /** Calendar days until the end date (0 = ends today, negative = overdue). */
  daysLeft: number;
}

const DAY_MS = 86_400_000;
const keyToTime = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));

/** Summaries of every active sprint, the ones ending soonest first. */
export const summarizeActiveSprints = (projects: Project[], tasks: Task[], today: Date = new Date()): ActiveSprintSummary[] => {
  const todayTime = keyToTime(toDateKey(today));

  return projects
    .filter(project => !project.archived)
    .flatMap(project => project.sprints
      .filter(sprint => sprint.status === 'active')
      .map(sprint => {
        const items = tasks.filter(task => task.sprint === sprint._id && !task.parent);
        const done = items.filter(task => task.status === 'completed');
        const points = items.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
        const completedPoints = done.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
        const progress = points > 0
          ? Math.round((completedPoints / points) * 100)
          : items.length > 0 ? Math.round((done.length / items.length) * 100) : 0;
        return {
          project,
          sprint,
          total: items.length,
          completed: done.length,
          points,
          completedPoints,
          progress,
          daysLeft: Math.round((keyToTime(dateKeyOf(sprint.endDate)) - todayTime) / DAY_MS),
        };
      }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
};

export const daysLeftLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `Ended ${-daysLeft} ${daysLeft === -1 ? 'day' : 'days'} ago`;
  if (daysLeft === 0) return 'Ends today';
  return `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
};
