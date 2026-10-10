// Board swimlanes: rows of tasks grouped by assignee, project or type (desktop only).
import { TASK_TYPES, TASK_TYPE_META } from '../constants';
import type { Task } from '../types';

export const SWIMLANE_GROUPS = ['none', 'assignee', 'project', 'type'] as const;
export type SwimlaneGroup = (typeof SWIMLANE_GROUPS)[number];

export const SWIMLANE_LABELS: Record<SwimlaneGroup, string> = {
  none: 'None',
  assignee: 'Assignee',
  project: 'Project',
  type: 'Type',
};

/** Lane id used when the board is not grouped. */
export const ALL_LANE_ID = 'all';

export interface Swimlane {
  /** Stable id (user id, project name, type...). */
  id: string;
  label: string;
  tasks: Task[];
}

/** `?group=` value -> a known grouping, `none` otherwise. */
export const parseSwimlaneGroup = (value: string | null | undefined): SwimlaneGroup =>
  (SWIMLANE_GROUPS as readonly string[]).includes(value ?? '') ? (value as SwimlaneGroup) : 'none';

interface LaneKey {
  id: string;
  label: string;
  /** Lanes sort by this; empty buckets ("Unassigned") go last. */
  sort: string;
  last?: boolean;
}

const UNASSIGNED: LaneKey = { id: 'unassigned', label: 'Unassigned', sort: '', last: true };
const NO_PROJECT: LaneKey = { id: 'no-project', label: 'No project', sort: '', last: true };

const laneKeyOf = (task: Task, group: Exclude<SwimlaneGroup, 'none'>): LaneKey => {
  if (group === 'assignee') {
    // A task sits in one lane: its first assignee (the card still shows everyone)
    const first = task.assignees?.[0];
    return first ? { id: `user:${first._id}`, label: first.name, sort: first.name.toLowerCase() } : UNASSIGNED;
  }
  if (group === 'project') {
    return task.project ? { id: `project:${task.project}`, label: task.project, sort: task.project.toLowerCase() } : NO_PROJECT;
  }
  const type = task.type ?? 'task';
  return { id: `type:${type}`, label: TASK_TYPE_META[type].label, sort: String(TASK_TYPES.indexOf(type)).padStart(2, '0') };
};

/**
 * Splits tasks into lanes. Empty lanes are not returned; each task lands in exactly one lane and the
 * order of tasks inside a lane is kept. `none` returns a single lane holding everything.
 */
export const groupIntoSwimlanes = (tasks: Task[], group: SwimlaneGroup): Swimlane[] => {
  if (group === 'none') return [{ id: ALL_LANE_ID, label: 'All tasks', tasks }];

  const lanes = new Map<string, Swimlane & { key: LaneKey }>();
  for (const task of tasks) {
    const key = laneKeyOf(task, group);
    const lane = lanes.get(key.id);
    if (lane) lane.tasks.push(task);
    else lanes.set(key.id, { id: key.id, label: key.label, tasks: [task], key });
  }

  return [...lanes.values()]
    .sort((a, b) => Number(a.key.last ?? false) - Number(b.key.last ?? false) || a.key.sort.localeCompare(b.key.sort))
    .map(({ id, label, tasks: laneTasks }) => ({ id, label, tasks: laneTasks }));
};

/** Id of the lane a task belongs to under `group`. */
export const laneIdOf = (task: Task, group: SwimlaneGroup): string =>
  group === 'none' ? ALL_LANE_ID : laneKeyOf(task, group).id;
