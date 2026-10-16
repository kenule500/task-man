import { useTranslation } from 'react-i18next';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import type { Task } from '../types';

interface ConfirmTaskDeleteProps {
  /** Task waiting for confirmation; null keeps the dialog closed. */
  task: Task | null;
  /** All tasks, to tell how many subtasks go with it. */
  tasks: Task[];
  onCancel: () => void;
  onConfirm: (task: Task) => void;
}

/** Asks before deleting a task (and its subtasks); the delete can still be undone from the toast afterwards. */
const ConfirmTaskDelete = ({ task, tasks, onCancel, onConfirm }: ConfirmTaskDeleteProps) => {
  const { t } = useTranslation('tasks');
  const subtaskCount = task ? tasks.filter(item => item.parent === task._id).length : 0;

  return (
    <ConfirmActionDialog
      open={task !== null}
      onOpenChange={open => !open && onCancel()}
      title={task?.parent ? t('delete.titleSubtask') : t('delete.titleTask')}
      description={
        <>
          <span className="font-medium text-slate-900">{task?.title}</span>
          {subtaskCount > 0 ? t('delete.bodyWithSubtasks', { count: subtaskCount }) : t('delete.body')}
        </>
      }
      confirmLabel={t('actions.delete')}
      onConfirm={() => task && onConfirm(task)}
    />
  );
};

export default ConfirmTaskDelete;
