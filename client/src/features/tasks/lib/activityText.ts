import i18n from '@/i18n';
import type { TaskActivityChange, TaskActivityEntry } from '../api';
import { PRIORITY_META, STATUS_META, TASK_TYPE_META } from '../constants';
import type { TaskPriority, TaskStatus, TaskType } from '../types';
import { dateKeyOf, formatDate } from './date';
import { formatDuration } from '@/features/time/lib/duration';
import { currentLocale } from '@/i18n/format';

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

const pointsLabel = (value: number) => i18n.t('tasks:form.points', { count: value });

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
      return a && b ? i18n.t('tasks:activity.renamed', { from: a, to: b }) : i18n.t('tasks:activity.renamedShort');
    case 'status':
    case 'priority':
    case 'type':
    {
      const name = i18n.t(`tasks:activity.fieldName.${field}`);
      return a && b ? i18n.t('tasks:activity.changedFromTo', { field: name, from: a, to: b }) : b ? i18n.t('tasks:activity.setTo', { field: name, to: b }) : i18n.t('tasks:activity.changedField', { field: name });
    }
    case 'storyPoints': {
      const numberOf = (value?: string) => (value !== undefined && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : undefined);
      const before = numberOf(from);
      const after = numberOf(to);
      if (before !== undefined && after !== undefined) return i18n.t('tasks:activity.points.changed', { from: before, to: after });
      if (after !== undefined) return i18n.t('tasks:activity.points.estimated', { points: pointsLabel(after) });
      return i18n.t('tasks:activity.points.cleared');
    }
    case 'estimateMinutes': {
      const minutesOf = (value?: string) => (value !== undefined && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : undefined);
      const before = minutesOf(from);
      const after = minutesOf(to);
      if (before !== undefined && after !== undefined) return i18n.t('tasks:activity.estimate.changed', { from: formatDuration(before), to: formatDuration(after) });
      if (after !== undefined) return i18n.t('tasks:activity.estimate.set', { value: formatDuration(after) });
      return i18n.t('tasks:activity.estimate.cleared');
    }
    case 'project':
      if (a && b) return i18n.t('tasks:activity.project.moved', { from: a, to: b });
      if (b) return i18n.t('tasks:activity.project.movedTo', { to: b });
      return a ? i18n.t('tasks:activity.project.removed', { from: a }) : i18n.t('tasks:activity.project.changed');
    case 'startDate':
    case 'deadline': {
      const name = i18n.t(`tasks:activity.dateName.${field}`);
      if (a && b) return i18n.t('tasks:activity.date.changed', { name, from: a, to: b });
      return b ? i18n.t('tasks:activity.date.set', { name, to: b }) : i18n.t('tasks:activity.date.cleared', { name });
    }
    case 'labels':
      if (a && b) return i18n.t('tasks:activity.labels.changed', { from: a, to: b });
      return b ? i18n.t('tasks:activity.labels.set', { to: b }) : i18n.t('tasks:activity.labels.removed');
    case 'sprint': {
      const fromName = from ? sprintName?.(from) : undefined;
      const toName = to ? sprintName?.(to) : undefined;
      if (!to) return fromName ? i18n.t('tasks:activity.sprint.toBacklogFrom', { from: fromName }) : i18n.t('tasks:activity.sprint.toBacklog');
      if (!from) return toName ? i18n.t('tasks:activity.sprint.to', { to: toName }) : i18n.t('tasks:activity.sprint.toSprint');
      return fromName && toName ? i18n.t('tasks:activity.sprint.fromTo', { from: fromName, to: toName }) : i18n.t('tasks:activity.sprint.changed');
    }
    case 'release':
      return to ? i18n.t('tasks:activity.release.assigned') : i18n.t('tasks:activity.release.removed');
    case 'assignees': {
      const before = Number(from ?? 0);
      const after = Number(to ?? 0);
      if (after > before) return i18n.t('tasks:activity.assignees.added', { count: after - before });
      if (after < before) return i18n.t('tasks:activity.assignees.removed', { count: before - after });
      return i18n.t('tasks:activity.assignees.changed');
    }
    case 'checklist':
      return b ? i18n.t('tasks:activity.checklist.updated', { done: b }) : i18n.t('tasks:activity.checklist.cleared');
    case 'acceptanceCriteria':
      return b ? i18n.t('ai:activity.criteria.updated', { count: Number(b) }) : i18n.t('ai:activity.criteria.cleared');
    case 'recurrence':
      if (a && b) return i18n.t('tasks:activity.recurrence.changed', { from: a, to: b });
      return b ? i18n.t('tasks:activity.recurrence.set', { to: b }) : i18n.t('tasks:activity.recurrence.stopped');
    case 'stage':
      // Values are stage keys ("in-review")
      return a && b ? i18n.t('tasks:activity.stage.moved', { from: a.replace(/-/g, ' '), to: b.replace(/-/g, ' ') }) : i18n.t('tasks:activity.stage.changed');
    case 'description':
      return i18n.t('tasks:activity.description');
    case 'relations':
      // Values look like "duplicated_by WEB-4"
      if (b) return i18n.t('tasks:activity.relations.linked', { to: b.replace(/_/g, ' ') });
      return a ? i18n.t('tasks:activity.relations.removed', { from: a.replace(/_/g, ' ') }) : i18n.t('tasks:activity.relations.changed');
    case 'parent':
      return to ? i18n.t('tasks:activity.parent.subtask') : i18n.t('tasks:activity.parent.standalone');
    default:
      return i18n.t('tasks:activity.changedField', { field });
  }
};

/** Human wording of one activity entry. */
export const describeActivity = (entry: TaskActivityEntry, options: ActivityTextOptions = {}): ActivityText => {
  const file = entry.changes.find(change => change.field === 'file');
  switch (entry.action) {
    case 'task.created':
      return {
        headline: entry.changes.some(change => change.field === 'parent')
          ? i18n.t('tasks:activity.created.subtask')
          : entry.changes.some(change => change.field === 'recurrence') ? i18n.t('tasks:activity.created.repeat') : i18n.t('tasks:activity.created.task'),
        details: [],
      };
    case 'task.duplicated': {
      const source = entry.changes.find(change => change.field === 'source')?.from;
      return { headline: source ? i18n.t('tasks:activity.duplicated', { source }) : i18n.t('tasks:activity.duplicatedTask'), details: [] };
    }
    case 'task.deleted': {
      const count = Number(entry.changes.find(change => change.field === 'subtasks')?.from ?? 0);
      return {
        headline: count > 0 ? i18n.t('tasks:activity.deletedWithSubtasks', { count }) : i18n.t('tasks:activity.deleted'),
        details: [],
      };
    }
    case 'task.commented':
      return { headline: i18n.t('tasks:activity.commented'), details: [] };
    case 'task.attachment_added':
      return { headline: file?.to ? i18n.t('tasks:activity.attached', { file: file.to }) : i18n.t('tasks:activity.attachedFile'), details: [] };
    case 'task.attachment_removed':
      return { headline: file?.from ? i18n.t('tasks:activity.attachmentRemoved', { file: file.from }) : i18n.t('tasks:activity.attachmentRemovedGeneric'), details: [] };
    case 'ai.review_completed': {
      const verdict = entry.changes.find(change => change.field === 'verdict')?.to;
      return {
        headline: verdict ? i18n.t('ai:activity.reviewCompleted', { verdict: i18n.t(`ai:verdict.${verdict}`) }) : i18n.t('ai:activity.reviewCompletedPlain'),
        details: [],
      };
    }
    case 'task.updated': {
      const sentences = entry.changes.map(change => describeChange(change, options));
      if (sentences.length === 0) return { headline: i18n.t('tasks:activity.updated'), details: [] };
      if (sentences.length === 1) return { headline: sentences[0], details: [] };
      return { headline: i18n.t('tasks:activity.madeChanges', { count: sentences.length }), details: sentences.map(text => text.charAt(0).toUpperCase() + text.slice(1)) };
    }
    default:
      return { headline: i18n.t('tasks:activity.updated'), details: [] };
  }
};

/** Full local date and time, for the `title` of relative times. */
export const absoluteTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' });
};
