import { describeChange } from '@/features/tasks/lib/activityText';
import { STATUS_META } from '@/features/tasks/constants';
import type { TaskStatus } from '@/features/tasks/types';
import type { LiveChange } from '../types';

/** Short sentence for a toast: "Dana moved WEB-12 to In Progress". `label` names the task (key or title). */
export const describeLiveChange = (change: LiveChange, label: string): string => {
  const who = change.actor?.name?.trim() || 'Someone';
  const subject = label || change.summary || 'this task';

  switch (change.action) {
    case 'task.commented': return `${who} commented on ${subject}`;
    case 'task.deleted': return `${who} deleted ${subject}`;
    case 'task.attachment_added': return `${who} added a file to ${subject}`;
    case 'task.attachment_removed': return `${who} removed a file from ${subject}`;
    case 'task.updated': {
      const [only] = change.fields;
      if (change.fields.length === 1 && only.field === 'status' && only.to) {
        return `${who} moved ${subject} to ${STATUS_META[only.to as TaskStatus]?.label ?? only.to}`;
      }
      if (change.fields.length === 1) return `${who} ${describeChange(only)} on ${subject}`;
      return change.fields.length > 1 ? `${who} updated ${subject} (${change.fields.length} fields)` : `${who} updated ${subject}`;
    }
    default: return `${who} changed ${subject}`;
  }
};

/** Actions that mean the open task itself changed under the user. */
export const isTaskContentChange = (action: string): boolean =>
  action === 'task.updated' || action === 'task.deleted' || action === 'task.commented'
  || action === 'task.attachment_added' || action === 'task.attachment_removed';

/** "5 s ago", "2 min ago" for the indicator tooltip. */
export const formatAgo = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
};
