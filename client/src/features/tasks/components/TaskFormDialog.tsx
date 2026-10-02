import { useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '../api';
import { getDependencyCandidates } from '../lib/dependencies';
import {
  toFormValues, toTaskInput, validateTaskForm, type TaskFormErrors, type TaskFormValues,
} from '../lib/taskForm';
import type { Task, TaskInput } from '../types';
import { DueDate, StatusDot } from './TaskBadges';
import { PrioritySelect, StatusSelect } from './TaskSelects';

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Task being edited; omit to create a new one. */
  task?: Task | null;
  /** Prefilled values for new tasks (e.g. the clicked calendar day or board column). */
  defaults?: Partial<TaskFormValues>;
  /** All workspace tasks, used to pick dependencies. */
  tasks: Task[];
  onSubmit: (input: TaskInput) => Promise<unknown>;
}

const fieldClass = 'h-10 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none';

/**
 * Create / edit form shared by every task view.
 * Mount it with a `key` per task so values reset when the target changes.
 */
const TaskFormDialog = ({ open, onOpenChange, task, defaults, tasks, onSubmit }: TaskFormDialogProps) => {
  const [values, setValues] = useState<TaskFormValues>(() => toFormValues(task, defaults));
  const [errors, setErrors] = useState<TaskFormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(() => getDependencyCandidates(tasks, task?._id), [tasks, task?._id]);
  const isEdit = Boolean(task);

  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setValues(current => ({ ...current, [key]: value }));

  const toggleDependency = (id: string, checked: boolean) =>
    set('dependencies', checked ? [...values.dependencies, id] : values.dependencies.filter(dep => dep !== id));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateTaskForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setSubmitError('');
    try {
      const result = await onSubmit(toTaskInput(values));
      if (result === null) {
        setSubmitError('Your changes could not be saved. Please try again.');
        return;
      }
      onOpenChange(false);
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Could not save the task.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden bg-white border border-gray-200 shadow-2xl gap-0">
        <div className="px-6 pt-6 pb-5 border-b border-gray-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ListTodo className="w-5 h-5 text-primary" />
            </div>
            <DialogHeader className="p-0 space-y-0 min-w-0">
              <DialogTitle className="text-lg font-bold text-slate-900 leading-tight">
                {isEdit ? 'Edit task' : 'Create a new task'}
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 mt-1 leading-relaxed">
                {isEdit ? 'Update the details, schedule or dependencies.' : 'Add the details, schedule and what it depends on.'}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {submitError && (
              <div role="alert" className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="task-title" className="text-sm font-medium text-slate-700">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="task-title"
                value={values.title}
                onChange={e => set('title', e.target.value)}
                placeholder="e.g. Prepare sprint review"
                className={fieldClass}
                maxLength={140}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'task-title-error' : undefined}
                autoFocus
              />
              {errors.title && <p id="task-title-error" className="text-xs text-red-600">{errors.title}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-description" className="text-sm font-medium text-slate-700">Description</Label>
              <Textarea
                id="task-description"
                value={values.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Add more context (optional)"
                className="min-h-20 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none"
                maxLength={2000}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-status" className="text-sm font-medium text-slate-700">Status</Label>
                <StatusSelect id="task-status" value={values.status} onChange={value => set('status', value)} className="h-10 border-gray-300" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-priority" className="text-sm font-medium text-slate-700">Priority</Label>
                <PrioritySelect id="task-priority" value={values.priority} onChange={value => set('priority', value)} className="h-10 border-gray-300" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-start" className="text-sm font-medium text-slate-700">Start date</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={values.startDate}
                  max={values.deadline || undefined}
                  onChange={e => set('startDate', e.target.value)}
                  className={fieldClass}
                  aria-invalid={Boolean(errors.startDate)}
                  aria-describedby={errors.startDate ? 'task-start-error' : undefined}
                />
                {errors.startDate && <p id="task-start-error" className="text-xs text-red-600">{errors.startDate}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-deadline" className="text-sm font-medium text-slate-700">
                  Due date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="task-deadline"
                  type="date"
                  value={values.deadline}
                  min={values.startDate || undefined}
                  onChange={e => set('deadline', e.target.value)}
                  className={fieldClass}
                  aria-invalid={Boolean(errors.deadline)}
                  aria-describedby={errors.deadline ? 'task-deadline-error' : undefined}
                />
                {errors.deadline && <p id="task-deadline-error" className="text-xs text-red-600">{errors.deadline}</p>}
              </div>
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-slate-700">Depends on</legend>
              <p className="text-xs text-slate-400">This task starts after the selected tasks are done. Used by the timeline.</p>
              {candidates.length === 0 ? (
                <p className="text-xs text-slate-400 italic pt-1">No other tasks available yet.</p>
              ) : (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {candidates.map(candidate => {
                    const checkboxId = `dep-${candidate._id}`;
                    return (
                      <li key={candidate._id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
                        <Checkbox
                          id={checkboxId}
                          checked={values.dependencies.includes(candidate._id)}
                          onCheckedChange={checked => toggleDependency(candidate._id, checked)}
                        />
                        <label htmlFor={checkboxId} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <StatusDot status={candidate.status} />
                          <span className="truncate">{candidate.title}</span>
                        </label>
                        <DueDate deadline={candidate.deadline} completed={candidate.status === 'completed'} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
          </div>

          <DialogFooter className="!m-0 px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-row justify-end gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg h-10 border-gray-300 text-slate-700 hover:bg-gray-100 text-sm font-medium shadow-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary hover:bg-primary-hover text-white h-10 text-sm font-medium shadow-sm px-5"
            >
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TaskFormDialog;
