import { useState, type FormEvent } from 'react';
import { Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormDialog from '@/components/FormDialog';
import type { MoveOpenTo, Release } from '../types';
import { formatReleaseDates } from '../lib/progress';

interface ReleaseNowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: Release;
  /** Other unreleased releases of the project that unfinished work can move to. */
  targets: Release[];
  /** Resolves when done; rejects with a readable message shown in the dialog. */
  onConfirm: (moveOpenTo: MoveOpenTo) => Promise<unknown>;
}

const KEEP = 'keep';
const REMOVE = 'remove';

const optionClass = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 has-[:checked]:border-primary has-[:checked]:bg-blue-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';

const toMove = (choice: string): MoveOpenTo => (choice === KEEP ? undefined : choice === REMOVE ? null : choice);

/** Asks where the unfinished tasks go before marking a release as released. */
const ReleaseNowDialog = ({ open, onOpenChange, release, targets, onConfirm }: ReleaseNowDialogProps) => {
  const { t } = useTranslation('projects');
  const { counts } = release.progress;
  const openCount = counts.pending + counts['in-progress'];
  const [choice, setChoice] = useState<string>(targets[0]?._id ?? KEEP);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(openCount === 0 ? undefined : toMove(choice));
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('releases.now.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Rocket />}
      title={t('releases.now.title', { name: release.name })}
      description={t('releases.now.description', { dates: formatReleaseDates(release) })}
      onSubmit={handleSubmit}
      submitLabel={t('releases.now.submit')}
      submittingLabel={t('releases.now.submitting')}
      submitting={submitting}
      error={error}
    >
      {openCount === 0 ? (
        <p className="text-sm text-slate-700">{t('releases.now.allDone')}</p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            {t('releases.now.unfinished', { count: openCount })}
          </legend>
          {targets.map(target => (
            <label key={target._id} className={optionClass}>
              <input type="radio" name="move-open-to" value={target._id} checked={choice === target._id} onChange={() => setChoice(target._id)} className="size-4 accent-blue-600" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{t('releases.now.moveTo', { name: target.name })}</span>
                <span className="block text-xs text-slate-600">{formatReleaseDates(target)}</span>
              </span>
            </label>
          ))}
          <label className={optionClass}>
            <input type="radio" name="move-open-to" value={REMOVE} checked={choice === REMOVE} onChange={() => setChoice(REMOVE)} className="size-4 accent-blue-600" />
            {t('releases.now.remove')}
          </label>
          <label className={optionClass}>
            <input type="radio" name="move-open-to" value={KEEP} checked={choice === KEEP} onChange={() => setChoice(KEEP)} className="size-4 accent-blue-600" />
            {t('releases.now.keep')}
          </label>
          {targets.length === 0 && (
            <p className="text-xs text-slate-600">{t('releases.now.planAnother')}</p>
          )}
        </fieldset>
      )}
    </FormDialog>
  );
};

export default ReleaseNowDialog;
