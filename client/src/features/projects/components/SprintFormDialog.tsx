import { useState, type FormEvent } from 'react';
import { CalendarRange } from 'lucide-react';
import FormDialog from '@/components/FormDialog';
import { Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { dateKeyOf } from '@/features/tasks';
import type { Sprint, SprintInput } from '../types';
import { MAX_SPRINT_GOAL, MAX_SPRINT_NAME } from '../lib/limits';

interface SprintFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sprint being edited; omit to plan a new one. */
  sprint?: Sprint | null;
  /** Prefilled values for a new sprint (see `suggestSprintName` / `suggestSprintDates`). */
  defaults?: Partial<SprintInput>;
  /** Resolves when saved; rejects with a readable message that is shown in the dialog. */
  onSubmit: (input: SprintInput) => Promise<unknown>;
}

type Errors = Partial<Record<'name' | 'goal' | 'startDate' | 'endDate', string>>;

const fieldClass = 'h-11 sm:h-10 bg-white border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-0 shadow-none';

/** Plan or edit a sprint: name, goal and its start and end days. Mount with a `key` per sprint. */
const SprintFormDialog = ({ open, onOpenChange, sprint, defaults, onSubmit }: SprintFormDialogProps) => {
  const [name, setName] = useState(sprint?.name ?? defaults?.name ?? '');
  const [goal, setGoal] = useState(sprint?.goal ?? defaults?.goal ?? '');
  const [startDate, setStartDate] = useState(sprint ? dateKeyOf(sprint.startDate) : defaults?.startDate ?? '');
  const [endDate, setEndDate] = useState(sprint ? dateKeyOf(sprint.endDate) : defaults?.endDate ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const editing = Boolean(sprint);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.name = 'Enter a sprint name.';
    else if (name.trim().length > MAX_SPRINT_NAME) next.name = `Keep the name under ${MAX_SPRINT_NAME} characters.`;
    if (goal.length > MAX_SPRINT_GOAL) next.goal = `Keep the goal under ${MAX_SPRINT_GOAL} characters.`;
    if (!startDate) next.startDate = 'Choose a start date.';
    if (!endDate) next.endDate = 'Choose an end date.';
    else if (startDate && endDate < startDate) next.endDate = 'The sprint must end on or after its start date.';
    return next;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit({ name: name.trim(), goal: goal.trim(), startDate, endDate });
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save the sprint.');
    } finally {
      setSubmitting(false);
    }
  };

  const describedBy = (id: string, hasError: boolean) => (hasError ? fieldMessageId(id) : undefined);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<CalendarRange />}
      title={editing ? 'Edit sprint' : 'New sprint'}
      description={editing ? 'Change the name, goal or dates of this sprint.' : 'Plan a time-boxed iteration. Add tasks to it from the backlog.'}
      onSubmit={handleSubmit}
      submitLabel={editing ? 'Save changes' : 'Create sprint'}
      submittingLabel="Saving..."
      submitting={submitting}
      error={submitError}
    >
      <Field label="Name" htmlFor="sprint-name" required error={errors.name}>
        <Input
          id="sprint-name"
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Sprint 1"
          autoFocus
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy('sprint-name', Boolean(errors.name))}
          className={fieldClass}
        />
      </Field>

      <Field label="Goal" htmlFor="sprint-goal" error={errors.goal} hint={`What should be true when the sprint ends? ${goal.length}/${MAX_SPRINT_GOAL}`}>
        <Textarea
          id="sprint-goal"
          value={goal}
          onChange={event => setGoal(event.target.value)}
          rows={2}
          aria-invalid={Boolean(errors.goal)}
          aria-describedby={fieldMessageId('sprint-goal')}
          className="bg-white border border-slate-300 text-slate-900 shadow-none"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="sprint-start" required error={errors.startDate}>
          <Input
            id="sprint-start"
            type="date"
            value={startDate}
            onChange={event => setStartDate(event.target.value)}
            aria-invalid={Boolean(errors.startDate)}
            aria-describedby={describedBy('sprint-start', Boolean(errors.startDate))}
            className={fieldClass}
          />
        </Field>
        <Field label="End date" htmlFor="sprint-end" required error={errors.endDate}>
          <Input
            id="sprint-end"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={event => setEndDate(event.target.value)}
            aria-invalid={Boolean(errors.endDate)}
            aria-describedby={describedBy('sprint-end', Boolean(errors.endDate))}
            className={fieldClass}
          />
        </Field>
      </div>
    </FormDialog>
  );
};

export default SprintFormDialog;
