import { useRef, useState, type FormEvent } from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProgressBar, SectionHeader, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '../api';
import { countSubtasks, sumSubtaskPoints } from '../lib/subtasks';
import type { Task } from '../types';
import { StatusDot, SubtaskProgress } from './TaskBadges';

export interface SubtaskListProps {
  subtasks: Task[];
  /** Holds `tasks:write`: toggle and add. */
  canWrite: boolean;
  /** Holds `tasks:delete`. */
  canDelete: boolean;
  /** Creates a subtask; throws so the list can show the server's message. */
  onAdd?: (title: string) => Promise<unknown>;
  /** Marks a subtask completed or pending again. */
  onToggle?: (task: Task, completed: boolean) => void;
  onOpen?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

/** Checklist of a task's subtasks with a progress count and an inline "add subtask" input. */
const SubtaskList = ({ subtasks, canWrite, canDelete, onAdd, onToggle, onOpen, onDelete }: SubtaskListProps) => {
  const { t } = useTranslation('tasks');
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const { done, total } = countSubtasks(subtasks);
  const points = sumSubtaskPoints(subtasks);
  const trimmed = title.trim();
  // Stays focused after each add so several subtasks can be typed in a row
  const inputRef = useRef<HTMLInputElement>(null);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!onAdd || !trimmed || adding) return;
    setAdding(true);
    try {
      await onAdd(trimmed);
      setTitle('');
      inputRef.current?.focus();
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('subtaskList.addError')));
    } finally {
      setAdding(false);
      inputRef.current?.focus();
    }
  };

  return (
    <section aria-label={t('badges.subtasks')}>
      <SectionHeader
        title={t('badges.subtasks')}
        icon={<ListChecks className="size-4 text-slate-500" aria-hidden />}
        action={<SubtaskProgress done={done} total={total} />}
        className="mb-2"
      />

      {total > 0 && (
        <div className="mb-3">
          <ProgressBar value={(done / total) * 100} label={t('badges.subtasksDone', { done, total })} showValue />
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {t('subtaskList.progressDone', { done, total })}
            {points.total > 0 && t('subtaskList.storyPoints', { done: points.done, count: points.total })}
          </p>
        </div>
      )}

      {total === 0 ? (
        <p className="text-sm text-slate-500">{t('subtaskList.none')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {subtasks.map(subtask => {
            const completed = subtask.status === 'completed';
            return (
              <li key={subtask._id} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                <Checkbox
                  checked={completed}
                  disabled={!canWrite || !onToggle}
                  onCheckedChange={checked => onToggle?.(subtask, checked)}
                  aria-label={t(completed ? 'subtaskList.markNotDone' : 'subtaskList.markDone', { title: subtask.title })}
                />
                <button
                  type="button"
                  onClick={() => onOpen?.(subtask)}
                  disabled={!onOpen}
                  className="min-w-0 flex-1 rounded py-1 text-start focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
                >
                  <span className={cn('block truncate text-sm font-medium text-slate-900', completed && 'text-slate-500 line-through')}>
                    {subtask.title}
                  </span>
                  {subtask.description && (
                    <span className="block truncate text-xs text-slate-500">{subtask.description}</span>
                  )}
                </button>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-600">
                  <StatusDot status={subtask.status} />
                  <span className="hidden sm:inline">{t(`status.${subtask.status}`)}</span>
                  <span className="sr-only sm:hidden">{t(`status.${subtask.status}`)}</span>
                </span>
                {canDelete && onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('subtaskList.delete', { title: subtask.title })}
                    onClick={() => onDelete(subtask)}
                    className="size-10 shrink-0 text-slate-500 hover:bg-danger-bg hover:text-danger-fg sm:size-8"
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && onAdd && (
        <form onSubmit={add} className="mt-3 flex items-center gap-2">
          <Input
            ref={inputRef}
            aria-label={t('subtaskList.addLabel')}
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder={t('subtaskList.addPlaceholder')}
            maxLength={140}
            readOnly={adding}
            className="h-11 rounded-lg border border-slate-300 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-0 sm:h-9 sm:text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!trimmed || adding}
            className="h-11 shrink-0 gap-1.5 border-slate-300 text-slate-700 sm:h-9"
          >
            <Plus className="size-4" aria-hidden /> {t('actions.add')}
          </Button>
        </form>
      )}
    </section>
  );
};

export default SubtaskList;
