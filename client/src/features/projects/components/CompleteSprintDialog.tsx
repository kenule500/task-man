import { useState, type FormEvent } from 'react';
import { Flag } from 'lucide-react';
import FormDialog from '@/components/FormDialog';
import type { MoveOpenTo, Sprint } from '../types';
import { formatSprintRange } from '../lib/sprintStats';

interface CompleteSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprint: Sprint;
  /** Top-level tasks of the sprint that are not completed. */
  openTaskCount: number;
  /** Sprints open tasks can move to. */
  plannedSprints: Sprint[];
  /** Resolves when done; rejects with a readable message shown in the dialog. */
  onConfirm: (moveOpenTo: MoveOpenTo) => Promise<unknown>;
}

const optionClass = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 has-[:checked]:border-primary has-[:checked]:bg-blue-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';

/** Asks where the unfinished tasks go before closing the active sprint. */
const CompleteSprintDialog = ({ open, onOpenChange, sprint, openTaskCount, plannedSprints, onConfirm }: CompleteSprintDialogProps) => {
  const [target, setTarget] = useState<MoveOpenTo>('backlog');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(target);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the sprint.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Flag />}
      title={`Complete ${sprint.name}`}
      description={`${formatSprintRange(sprint)}. Finished tasks stay in the sprint and count towards velocity.`}
      onSubmit={handleSubmit}
      submitLabel="Complete sprint"
      submittingLabel="Completing..."
      submitting={submitting}
      error={error}
    >
      {openTaskCount === 0 ? (
        <p className="text-sm text-slate-700">Every task in this sprint is done. Nothing needs to move.</p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            {openTaskCount} unfinished {openTaskCount === 1 ? 'task' : 'tasks'}: move them to
          </legend>
          <label className={optionClass}>
            <input type="radio" name="move-open-to" value="backlog" checked={target === 'backlog'} onChange={() => setTarget('backlog')} className="size-4 accent-blue-600" />
            Backlog
          </label>
          {plannedSprints.map(planned => (
            <label key={planned._id} className={optionClass}>
              <input type="radio" name="move-open-to" value={planned._id} checked={target === planned._id} onChange={() => setTarget(planned._id)} className="size-4 accent-blue-600" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{planned.name}</span>
                <span className="block text-xs text-slate-600">{formatSprintRange(planned)}</span>
              </span>
            </label>
          ))}
          {plannedSprints.length === 0 && (
            <p className="text-xs text-slate-600">Plan another sprint to move tasks straight into it.</p>
          )}
        </fieldset>
      )}
    </FormDialog>
  );
};

export default CompleteSprintDialog;
