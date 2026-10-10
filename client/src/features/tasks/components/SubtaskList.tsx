import { useState, type FormEvent } from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { SectionHeader, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { STATUS_META } from '../constants';
import { getApiErrorMessage } from '../api';
import { countSubtasks } from '../lib/subtasks';
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
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const { done, total } = countSubtasks(subtasks);
  const trimmed = title.trim();

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!onAdd || !trimmed || adding) return;
    setAdding(true);
    try {
      await onAdd(trimmed);
      setTitle('');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not add the subtask.'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <section aria-label="Subtasks">
      <SectionHeader
        title="Subtasks"
        icon={<ListChecks className="size-4 text-slate-500" aria-hidden />}
        action={<SubtaskProgress done={done} total={total} />}
        className="mb-2"
      />

      {total === 0 ? (
        <p className="text-sm text-slate-500">No subtasks yet.</p>
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
                  aria-label={completed ? `Mark subtask "${subtask.title}" as not done` : `Mark subtask "${subtask.title}" as done`}
                />
                <button
                  type="button"
                  onClick={() => onOpen?.(subtask)}
                  disabled={!onOpen}
                  className="min-w-0 flex-1 rounded py-1 text-left focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
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
                  <span className="hidden sm:inline">{STATUS_META[subtask.status].label}</span>
                  <span className="sr-only sm:hidden">{STATUS_META[subtask.status].label}</span>
                </span>
                {canDelete && onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete subtask ${subtask.title}`}
                    onClick={() => onDelete(subtask)}
                    className="size-10 shrink-0 text-slate-500 hover:bg-red-50 hover:text-red-600 sm:size-8"
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
            aria-label="Add subtask"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Add a subtask and press Enter"
            maxLength={140}
            disabled={adding}
            className="h-11 rounded-lg border border-slate-300 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-0 sm:h-9 sm:text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!trimmed || adding}
            className="h-11 shrink-0 gap-1.5 border-slate-300 text-slate-700 sm:h-9"
          >
            <Plus className="size-4" aria-hidden /> Add
          </Button>
        </form>
      )}
    </section>
  );
};

export default SubtaskList;
