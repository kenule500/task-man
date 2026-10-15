import type { TaskActivityChange, TaskActivityEntry } from '../api';
import { PRIORITY_META, STATUS_META, TASK_TYPE_META } from '../constants';
import type { TaskPriority, TaskStatus, TaskType } from '../types';
import { dateKeyOf, formatDate } from './date';
import { formatDuration } from '@/features/time/lib/duration';

export interface ActivityTextOptions {
  /** Names a sprint id; unknown ids read as "a sprint". */
  sprintName?: (sprintId: string) => string | undefined;
}

export interface ActivityText {
  /** Starts with a verb ("changed status from Pending to In Progress"); the actor is prepended by the UI. */
  headline: string;
  /** One line per change when an update touched several fields. */
  details: string[];
}

const pointsLabel = (value: number) => `${value} ${value === 1 ? 'point' : 'points'}`;

const labelOf = (field: string, value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  if (field === 'status') return STATUS_META[value as TaskStatus]?.label ?? value;
  if (field === 'priority') return PRIORITY_META[value as TaskPriority]?.label ?? value;
  if (field === 'type') return TASK_TYPE_META[value as TaskType]?.label ?? value;
  if (field === 'startDate' || field === 'deadline') return /^\d{4}-\d{2}-\d{2}/.test(value) ? formatDate(dateKeyOf(value)) : value;
  return value;
};

/** Sentence (without the actor) for one changed field. */
export const describeChange = ({ field, from, to }: TaskActivityChange, { sprintName }: ActivityTextOptions = {}): string => {
  const a = labelOf(field, from);
  const b = labelOf(field, to);

  switch (field) {
    case 'title':
      return a && b ? `renamed the task from "${a}" to "${b}"` : 'renamed the task';
    case 'status':
    case 'priority':
    case 'type':
      return a && b ? `changed ${field} from ${a} to ${b}` : b ? `set ${field} to ${b}` : `changed ${field}`;
    case 'storyPoints': {
      const numberOf = (value?: string) => (value !== undefined && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : undefined);
      const before = numberOf(from);
      const after = numberOf(to);
      if (before !== undefined && after !== undefined) return `changed story points from ${before} to ${after}`;
      if (after !== undefined) return `estimated this at ${pointsLabel(after)}`;
      return 'cleared the story points';
    }
    case 'estimateMinutes': {
      const minutesOf = (value?: string) => (value !== undefined && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : undefined);
      const before = minutesOf(from);
      const after = minutesOf(to);
      if (before !== undefined && after !== undefined) return `changed the estimate from ${formatDuration(before)} to ${formatDuration(after)}`;
      if (after !== undefined) return `estimated this at ${formatDuration(after)}`;
      return 'cleared the estimate';
    }
    case 'project':
      if (a && b) return `moved this from project ${a} to ${b}`;
      if (b) return `moved this to project ${b}`;
      return a ? `removed this from project ${a}` : 'changed the project';
    case 'startDate':
    case 'deadline': {
      const name = field === 'deadline' ? 'due date' : 'start date';
      if (a && b) return `changed the ${name} from ${a} to ${b}`;
      return b ? `set the ${name} to ${b}` : `cleared the ${name}`;
    }
    case 'labels':
      if (a && b) return `changed labels from ${a} to ${b}`;
      return b ? `set labels to ${b}` : 'removed all labels';
    case 'sprint': {
      const fromName = from ? sprintName?.(from) : undefined;
      const toName = to ? sprintName?.(to) : undefined;
      if (!to) return fromName ? `moved this from ${fromName} to the backlog` : 'moved this to the backlog';
      if (!from) return toName ? `moved this to ${toName}` : 'moved this to a sprint';
      return fromName && toName ? `moved this from ${fromName} to ${toName}` : 'changed the sprint';
    }
    case 'release':
      return to ? 'assigned this to a release' : 'removed this from its release';
    case 'assignees': {
      const before = Number(from ?? 0);
      const after = Number(to ?? 0);
      if (after > before) return `added ${after - before} ${after - before === 1 ? 'assignee' : 'assignees'}`;
      if (after < before) return `removed ${before - after} ${before - after === 1 ? 'assignee' : 'assignees'}`;
      return 'changed the assignees';
    }
    case 'checklist':
      return b ? `updated the checklist (${b} done)` : 'cleared the checklist';
    case 'recurrence':
      if (a && b) return `changed the repeat from ${a} to ${b}`;
      return b ? `set the task to repeat ${b}` : 'stopped the task from repeating';
    case 'stage':
      // Values are stage keys ("in-review")
      return a && b ? `moved this from ${a.replace(/-/g, ' ')} to ${b.replace(/-/g, ' ')}` : 'changed the stage';
    case 'description':
      return 'edited the description';
    case 'relations':
      // Values look like "duplicated_by WEB-4"
      if (b) return `linked this: ${b.replace(/_/g, ' ')}`;
      return a ? `removed the link: ${a.replace(/_/g, ' ')}` : 'changed the links';
    case 'parent':
      return to ? 'made this a subtask' : 'made this a standalone task';
    default:
      return `changed ${field}`;
  }
};

/** Human wording of one activity entry. */
export const describeActivity = (entry: TaskActivityEntry, options: ActivityTextOptions = {}): ActivityText => {
  const file = entry.changes.find(change => change.field === 'file');
  switch (entry.action) {
    case 'task.created':
      return {
        headline: entry.changes.some(change => change.field === 'parent')
          ? 'created this subtask'
          : entry.changes.some(change => change.field === 'recurrence') ? 'created this task as the next repeat' : 'created this task',
        details: [],
      };
    case 'task.duplicated': {
      const source = entry.changes.find(change => change.field === 'source')?.from;
      return { headline: source ? `duplicated "${source}"` : 'duplicated a task', details: [] };
    }
    case 'task.deleted': {
      const count = Number(entry.changes.find(change => change.field === 'subtasks')?.from ?? 0);
      return {
        headline: count > 0 ? `deleted this task and ${count} ${count === 1 ? 'subtask' : 'subtasks'}` : 'deleted this task',
        details: [],
      };
    }
    case 'task.commented':
      return { headline: 'added a comment', details: [] };
    case 'task.attachment_added':
      return { headline: file?.to ? `attached ${file.to}` : 'attached a file', details: [] };
    case 'task.attachment_removed':
      return { headline: file?.from ? `removed the attachment ${file.from}` : 'removed an attachment', details: [] };
    case 'task.updated': {
      const sentences = entry.changes.map(change => describeChange(change, options));
      if (sentences.length === 0) return { headline: 'updated this task', details: [] };
      if (sentences.length === 1) return { headline: sentences[0], details: [] };
      return { headline: `made ${sentences.length} changes`, details: sentences.map(text => text.charAt(0).toUpperCase() + text.slice(1)) };
    }
    default:
      return { headline: 'updated this task', details: [] };
  }
};

/** Full local date and time, for the `title` of relative times. */
export const absoluteTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};
