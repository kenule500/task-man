// Epics: containers that group the work items of a project across sprints. Pure helpers, no UI.
import type { Task } from '../types';
import { dateKeyOf } from './date';

/** Top-level work items of an epic (subtasks count through their parent). */
export const itemsOfEpic = (tasks: Task[], epicId: string): Task[] =>
  tasks.filter(task => task.epic === epicId && !task.parent && task.type !== 'epic');

export interface EpicProgress {
  items: number;
  doneItems: number;
  points: number;
  donePoints: number;
  /** 0-100, by story points when any item is estimated, otherwise by item count. */
  percent: number;
  unit: 'points' | 'items';
  /** `YYYY-MM-DD` of the earliest start and the latest deadline over the epic and its items. */
  start: string;
  end: string;
}

const pointsOf = (task: Task) => Math.max(0, task.storyPoints ?? 0);
const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** Rolled-up progress and date span of an epic from the workspace (or project) tasks. */
export const epicProgress = (epic: Task, tasks: Task[]): EpicProgress => {
  const items = itemsOfEpic(tasks, epic._id);
  const done = items.filter(item => item.status === 'completed');
  const points = items.reduce((sum, item) => sum + pointsOf(item), 0);
  const donePoints = done.reduce((sum, item) => sum + pointsOf(item), 0);
  const byPoints = points > 0;

  const starts = [epic, ...items].map(task => dateKeyOf(task.startDate ?? task.deadline));
  const ends = [epic, ...items].map(task => dateKeyOf(task.deadline));
  return {
    items: items.length,
    doneItems: done.length,
    points,
    donePoints,
    percent: byPoints ? percentOf(donePoints, points) : percentOf(done.length, items.length),
    unit: byPoints ? 'points' : 'items',
    start: starts.reduce((min, key) => (key < min ? key : min)),
    end: ends.reduce((max, key) => (key > max ? key : max)),
  };
};

/** "3 of 5 items done" plus "8 of 21 points" when the items are estimated. */
export const describeEpicProgress = (progress: EpicProgress): string => {
  const items = `${progress.doneItems} of ${progress.items} ${progress.items === 1 ? 'item' : 'items'} done`;
  return progress.points > 0 ? `${items}, ${progress.donePoints} of ${progress.points} points` : items;
};
