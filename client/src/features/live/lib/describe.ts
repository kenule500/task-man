import i18n from '@/i18n';
import { describeChange } from '@/features/tasks/lib/activityText';
import { STATUS_META } from '@/features/tasks/constants';
import type { TaskStatus } from '@/features/tasks/types';
import type { LiveChange } from '../types';

/** Short sentence for a toast: "Dana moved WEB-12 to In Progress". `label` names the task (key or title). */
export const describeLiveChange = (change: LiveChange, label: string): string => {
  const who = change.actor?.name?.trim() || i18n.t('tasks:live.someone');
  const subject = label || change.summary || i18n.t('tasks:live.thisTask');

  switch (change.action) {
    case 'task.commented': return i18n.t('tasks:live.commented', { who, subject });
    case 'task.deleted': return i18n.t('tasks:live.deleted', { who, subject });
    case 'task.attachment_added': return i18n.t('tasks:live.fileAdded', { who, subject });
    case 'task.attachment_removed': return i18n.t('tasks:live.fileRemoved', { who, subject });
    case 'task.updated': {
      const [only] = change.fields;
      if (change.fields.length === 1 && only.field === 'status' && only.to) {
        return i18n.t('tasks:live.movedTo', { who, subject, status: STATUS_META[only.to as TaskStatus]?.label ?? only.to });
      }
      if (change.fields.length === 1) return i18n.t('tasks:live.fieldChange', { who, change: describeChange(only), subject });
      return change.fields.length > 1 ? i18n.t('tasks:live.updatedFields', { who, subject, count: change.fields.length }) : i18n.t('tasks:live.updated', { who, subject });
    }
    default: return i18n.t('tasks:live.changed', { who, subject });
  }
};

/** Actions that mean the open task itself changed under the user. */
export const isTaskContentChange = (action: string): boolean =>
  action === 'task.updated' || action === 'task.deleted' || action === 'task.commented'
  || action === 'task.attachment_added' || action === 'task.attachment_removed';

/** "5 s ago", "2 min ago" for the indicator tooltip. */
export const formatAgo = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return i18n.t('tasks:live.secondsAgo', { n: seconds });
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? i18n.t('tasks:live.minutesAgo', { n: minutes }) : i18n.t('tasks:live.hoursAgo', { n: Math.floor(minutes / 60) });
};
