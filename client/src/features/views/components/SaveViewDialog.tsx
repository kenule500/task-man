import { useId, useState, type FormEvent } from 'react';
import { BookmarkPlus, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormDialog from '@/components/FormDialog';
import { Field, fieldMessageId } from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

export const MAX_VIEW_NAME = 60;

interface SaveViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'rename';
  initialName?: string;
  initialShared?: boolean;
  /** Only the owner decides who sees a view. */
  canShare?: boolean;
  /** What is being saved, e.g. "Board · status pending". */
  summary?: string;
  /** Resolves to an error message, or `null` when saved (the dialog then closes). */
  onSubmit: (name: string, shared: boolean) => Promise<string | null>;
}

/** Name + share toggle for saving the current view or editing a saved one. Mount it only while open. */
const SaveViewDialog = ({
  open, onOpenChange, mode, initialName = '', initialShared = false, canShare = true, summary, onSubmit,
}: SaveViewDialogProps) => {
  const { t } = useTranslation('tasks');
  const uid = useId();
  const nameId = `${uid}-name`;
  const sharedId = `${uid}-shared`;
  const [name, setName] = useState(initialName);
  const [shared, setShared] = useState(initialShared);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldError(t('views.nameRequired'));
      document.getElementById(nameId)?.focus();
      return;
    }
    setFieldError('');
    setError('');
    setSubmitting(true);
    const failure = await onSubmit(trimmed, shared);
    setSubmitting(false);
    if (failure) setError(failure);
    else onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={mode === 'create' ? <BookmarkPlus aria-hidden /> : <Pencil aria-hidden />}
      title={mode === 'create' ? t('views.saveTitle') : t('views.editTitle')}
      description={mode === 'create'
        ? t('views.saveDescription')
        : t('views.editDescription')}
      onSubmit={handleSubmit}
      submitLabel={mode === 'create' ? t('views.saveButton') : t('taskForm.saveChanges')}
      submittingLabel={t('taskForm.saving')}
      submitting={submitting}
      error={error}
    >
      <Field
        label={t('views.name')}
        htmlFor={nameId}
        required
        error={fieldError || undefined}
        hint={fieldError ? undefined : summary}
      >
        <Input
          id={nameId}
          value={name}
          onChange={event => setName(event.target.value)}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={summary || fieldError ? fieldMessageId(nameId) : undefined}
          placeholder={t('views.namePlaceholder')}
          maxLength={MAX_VIEW_NAME}
          autoComplete="off"
          autoFocus
          className="h-11 rounded-lg border-slate-300 bg-white text-base shadow-none placeholder:text-slate-500 md:text-sm"
        />
      </Field>

      {canShare && (
        <label htmlFor={sharedId} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Checkbox id={sharedId} checked={shared} onCheckedChange={checked => setShared(checked === true)} className="mt-0.5" />
          <span className="min-w-0 text-sm">
            <span className="block font-medium text-slate-900">{t('views.shareLabel')}</span>
            <span className="block text-slate-600">{t('views.shareHint')}</span>
          </span>
        </label>
      )}
    </FormDialog>
  );
};

export default SaveViewDialog;
