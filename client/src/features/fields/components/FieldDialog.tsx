import { useId, useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, Field, OptionCombobox, SwitchField } from '@/components/ds';
import { fieldMessageId } from '@/components/ds/variants';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/utils/api';
import { OptionSelect } from '@/features/tasks/components/TaskSelects';
import {
  FIELD_COLOR_META, FIELD_TYPE_META, MAX_FIELD_NAME, MAX_OPTIONS, MAX_OPTION_LABEL, draftOf, hasOptions, validateFieldDraft,
  type FieldDraft,
} from '../lib/fields';
import { FIELD_COLORS, FIELD_TYPES, type CustomField, type FieldColor } from '../types';

interface FieldDialogProps {
  open: boolean;
  /** The field being edited; null creates a new one. */
  field: CustomField | null;
  /** Project names to restrict the field to. */
  projectNames: string[];
  onOpenChange: (open: boolean) => void;
  /** Saves the draft; rejects with the API error. */
  onSave: (draft: FieldDraft) => Promise<void>;
}

const CONTROL = 'h-11 text-base sm:h-9 sm:text-sm';
const TYPE_OPTIONS = FIELD_TYPES.map(type => ({ value: type, get label() { return FIELD_TYPE_META[type].label; } }));

interface OptionRowProps {
  index: number;
  label: string;
  color: FieldColor;
  onChange: (patch: { label?: string; color?: FieldColor }) => void;
  onRemove: () => void;
}

const OptionRow = ({ index, label, color, onChange, onRemove }: OptionRowProps) => {
  const { t } = useTranslation('admin');
  const id = useId();
  const name = label.trim() || t('fields.dialog.option', { n: index + 1 });
  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-2.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">{t('fields.dialog.optionName', { n: index + 1 })}</label>
        <Input
          id={id}
          value={label}
          maxLength={MAX_OPTION_LABEL + 10}
          onChange={event => onChange({ label: event.target.value })}
          placeholder={t('fields.dialog.option', { n: index + 1 })}
          className={CONTROL}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('fields.dialog.removeOption', { name })}
          onClick={onRemove}
          className="size-11 shrink-0 text-danger-fg hover:bg-danger-bg sm:size-8"
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <div role="group" aria-label={t('fields.dialog.colorOf', { name })} className="flex flex-wrap items-center gap-0.5">
        {FIELD_COLORS.map(item => {
          const selected = item === color;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={selected}
              aria-label={FIELD_COLOR_META[item].label}
              title={FIELD_COLOR_META[item].label}
              onClick={() => onChange({ color: item })}
              className="inline-flex size-10 items-center justify-center rounded-lg outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary sm:size-8"
            >
              <span
                aria-hidden
                className={cn(
                  'size-5 rounded-full ring-offset-2 ring-offset-white sm:size-4',
                  FIELD_COLOR_META[item].dot,
                  selected && 'ring-2 ring-slate-700',
                )}
              />
            </button>
          );
        })}
      </div>
    </li>
  );
};

const Body = ({ field, projectNames, onOpenChange, onSave }: Omit<FieldDialogProps, 'open'>) => {
  const { t } = useTranslation('admin');
  const id = useId();
  const nameId = `${id}-name`;
  const editing = field !== null;
  const [draft, setDraft] = useState<FieldDraft>(() => draftOf(field));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errors = useMemo(() => validateFieldDraft(draft), [draft]);
  const shownErrors = submitted ? errors : {};

  // Projects the field names that no longer exist stay selectable so they can be removed
  const projectOptions = useMemo(
    () => [...new Set([...projectNames, ...draft.projects])].sort().map(name => ({ value: name, label: name })),
    [projectNames, draft.projects],
  );

  const patch = (next: Partial<FieldDraft>) => { setDraft(current => ({ ...current, ...next })); setError(''); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, t('fields.dialog.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="flex max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-xl">
      <DialogHeader className="shrink-0 border-b border-slate-200 px-4 pt-5 pb-4 pe-12 sm:px-6">
        <DialogTitle className="text-lg font-bold text-slate-900">{editing ? t('fields.dialog.editTitle', { name: field.name }) : t('fields.dialog.newTitle')}</DialogTitle>
        <DialogDescription className="text-sm text-slate-600">
          {editing
            ? t('fields.dialog.editDescription')
            : t('fields.dialog.newDescription')}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={event => { void submit(event); }} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {error && <Alert tone="error">{error}</Alert>}

          <Field label={t('fields.dialog.name')} htmlFor={nameId} required error={shownErrors.name}>
            <Input
              id={nameId}
              value={draft.name}
              maxLength={MAX_FIELD_NAME + 10}
              autoFocus
              onChange={event => patch({ name: event.target.value })}
              aria-invalid={shownErrors.name ? true : undefined}
              aria-describedby={shownErrors.name ? fieldMessageId(nameId) : undefined}
              placeholder={t('fields.dialog.namePlaceholder')}
              className={CONTROL}
            />
          </Field>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">{t('fields.dialog.type')}</p>
            <OptionSelect
              aria-label={t('fields.dialog.fieldType')}
              value={draft.type}
              options={TYPE_OPTIONS}
              disabled={editing}
              onChange={type => patch({ type, options: hasOptions(type) ? draft.options : [] })}
              className={cn(CONTROL, 'border-slate-300')}
            />
            <p className="text-xs text-slate-600">{FIELD_TYPE_META[draft.type].description}</p>
          </div>

          {hasOptions(draft.type) && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">
                {t('fields.dialog.options')} <span className="font-normal text-slate-600 tabular-nums">({draft.options.length}/{MAX_OPTIONS})</span>
              </p>
              {draft.options.length > 0 && (
                <ul aria-label={t('fields.dialog.options')} className="space-y-2">
                  {draft.options.map((option, index) => (
                    <OptionRow
                      // New options have no id yet, so the position identifies them while editing
                      key={option.id ?? `new-${index}`}
                      index={index}
                      label={option.label}
                      color={option.color}
                      onChange={change => patch({ options: draft.options.map((item, at) => (at === index ? { ...item, ...change } : item)) })}
                      onRemove={() => patch({ options: draft.options.filter((_, at) => at !== index) })}
                    />
                  ))}
                </ul>
              )}
              {shownErrors.options && <p role="alert" className="text-sm text-danger-fg">{shownErrors.options}</p>}
              <Button
                type="button"
                variant="outline"
                disabled={draft.options.length >= MAX_OPTIONS}
                onClick={() => patch({ options: [...draft.options, { label: '', color: FIELD_COLORS[draft.options.length % FIELD_COLORS.length] }] })}
                className="h-11 gap-2 px-4 text-sm sm:h-9"
              >
                <Plus aria-hidden /> {t('fields.dialog.addOption')}
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">{t('fields.dialog.projects')}</p>
            <OptionCombobox
              multiple
              label={t('fields.dialog.projects')}
              options={projectOptions}
              value={draft.projects}
              onValueChange={projects => patch({ projects })}
              placeholder={draft.projects.length === 0 ? t('fields.dialog.everyProject') : t('fields.dialog.addAnother')}
              emptyText={t('fields.dialog.noProject')}
            />
            <p className="text-xs text-slate-600">{t('fields.dialog.leaveEmpty')}</p>
          </div>

          <SwitchField
            label={t('fields.dialog.required')}
            description={t('fields.dialog.requiredBody')}
            checked={draft.required}
            onCheckedChange={required => patch({ required })}
          />
        </div>

        <DialogFooter className="m-0 shrink-0 flex-row justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-10 border-slate-300 text-slate-700">
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={saving} className="h-10 px-5">
            {saving ? t('actions.saving') : editing ? t('fields.dialog.saveChanges') : t('fields.dialog.create')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
};

/** Create / edit dialog of a custom field. Remounts its form each time it opens. */
const FieldDialog = ({ open, field, ...rest }: FieldDialogProps) => (
  <Dialog open={open} onOpenChange={rest.onOpenChange}>
    {open && <Body key={field?._id ?? 'new'} field={field} {...rest} />}
  </Dialog>
);

export default FieldDialog;
