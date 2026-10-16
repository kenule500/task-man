import { useState, type FormEvent } from 'react';
import { Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormDialog from '@/components/FormDialog';
import { Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { dateKeyOf } from '@/features/tasks/lib/date';
import { MAX_RELEASE_DESCRIPTION, MAX_RELEASE_NAME } from '../lib/limits';
import type { Release } from '../types';

export interface ReleaseFormValues {
  name: string;
  description: string;
  startDate: string | null;
  releaseDate: string | null;
}

interface ReleaseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Release being edited; omit to plan a new one. */
  release?: Release | null;
  /** Prefilled values for a new release. */
  defaults?: Partial<ReleaseFormValues>;
  /** Resolves when saved; rejects with a readable message that is shown in the dialog. */
  onSubmit: (values: ReleaseFormValues) => Promise<unknown>;
}

type Errors = Partial<Record<'name' | 'description' | 'releaseDate', string>>;

const fieldClass = 'h-11 sm:h-10 bg-white border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-0 shadow-none';

/** Plan or edit a release (version): name, description and dates. Mount with a `key` per release. */
const ReleaseFormDialog = ({ open, onOpenChange, release, defaults, onSubmit }: ReleaseFormDialogProps) => {
  const { t } = useTranslation('projects');
  const [name, setName] = useState(release?.name ?? defaults?.name ?? '');
  const [description, setDescription] = useState(release?.description ?? defaults?.description ?? '');
  const [startDate, setStartDate] = useState(release?.startDate ? dateKeyOf(release.startDate) : defaults?.startDate ?? '');
  const [releaseDate, setReleaseDate] = useState(release?.releaseDate ? dateKeyOf(release.releaseDate) : defaults?.releaseDate ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const editing = Boolean(release);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.name = t('releases.form.nameRequired');
    else if (name.trim().length > MAX_RELEASE_NAME) next.name = t('releases.form.nameTooLong', { max: MAX_RELEASE_NAME });
    if (description.length > MAX_RELEASE_DESCRIPTION) next.description = t('releases.form.descriptionTooLong', { max: MAX_RELEASE_DESCRIPTION });
    if (startDate && releaseDate && releaseDate < startDate) next.releaseDate = t('releases.form.dateOrder');
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
      await onSubmit({ name: name.trim(), description: description.trim(), startDate: startDate || null, releaseDate: releaseDate || null });
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('releases.form.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  const describedBy = (id: string, hasError: boolean) => (hasError ? fieldMessageId(id) : undefined);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Rocket />}
      title={editing ? t('releases.form.editTitle') : t('releases.form.newTitle')}
      description={editing ? t('releases.form.editDescription') : t('releases.form.newDescription')}
      onSubmit={handleSubmit}
      submitLabel={editing ? t('releases.form.saveChanges') : t('releases.form.create')}
      submittingLabel={t('releases.form.saving')}
      submitting={submitting}
      error={submitError}
    >
      <Field label={t('releases.form.name')} htmlFor="release-name" required error={errors.name}>
        <Input
          id="release-name"
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="v1.2.0"
          autoFocus
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy('release-name', Boolean(errors.name))}
          className={fieldClass}
        />
      </Field>

      <Field label={t('releases.form.description')} htmlFor="release-description" error={errors.description} hint={t('releases.form.descriptionHint', { length: description.length, max: MAX_RELEASE_DESCRIPTION })}>
        <Textarea
          id="release-description"
          value={description}
          onChange={event => setDescription(event.target.value)}
          rows={3}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={fieldMessageId('release-description')}
          className="bg-white border border-slate-300 text-slate-900 shadow-none"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('releases.form.startDate')} htmlFor="release-start">
          <Input
            id="release-start"
            type="date"
            value={startDate}
            onChange={event => setStartDate(event.target.value)}
            className={fieldClass}
          />
        </Field>
        <Field label={t('releases.form.releaseDate')} htmlFor="release-date" error={errors.releaseDate}>
          <Input
            id="release-date"
            type="date"
            value={releaseDate}
            min={startDate || undefined}
            onChange={event => setReleaseDate(event.target.value)}
            aria-invalid={Boolean(errors.releaseDate)}
            aria-describedby={describedBy('release-date', Boolean(errors.releaseDate))}
            className={fieldClass}
          />
        </Field>
      </div>
    </FormDialog>
  );
};

export default ReleaseFormDialog;
