import type { Sprint } from '../types';

export interface SprintVelocity {
  sprint: Sprint;
  points: number;
}

const endOf = (sprint: Sprint) => sprint.completedAt ?? sprint.endDate;

/** Completed sprints, oldest first, with the points they delivered. */
export const sprintVelocities = (sprints: Sprint[]): SprintVelocity[] =>
  sprints
    .filter(sprint => sprint.status === 'completed')
    .sort((a, b) => endOf(a).localeCompare(endOf(b)))
    .map(sprint => ({ sprint, points: sprint.completedPoints ?? 0 }));

/** Average points of the last `count` completed sprints, rounded to one decimal; `null` before the first one. */
export const averageVelocity = (sprints: Sprint[], count = 3): number | null => {
  const recent = sprintVelocities(sprints).slice(-count);
  if (recent.length === 0) return null;
  const average = recent.reduce((sum, item) => sum + item.points, 0) / recent.length;
  return Math.round(average * 10) / 10;
};
