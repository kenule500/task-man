import { useState, type FormEvent } from 'react';
import { FolderPlus, FolderPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormDialog from '@/components/FormDialog';
import { Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PROJECT_COLORS, PROJECT_ICONS, type Project, type ProjectColor, type ProjectIcon, type ProjectInput } from '../types';
import { PROJECT_COLOR_STYLES } from '../lib/appearance';
import ProjectFolderIcon from './ProjectFolderIcon';
import { MAX_PROJECT_DESCRIPTION, MAX_PROJECT_NAME } from '../lib/limits';
import { isValidProjectKey, normalizeProjectKey, suggestProjectKey } from '../lib/projectKey';


interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project being edited; omit to create one. */
  project?: Project | null;
  /** Resolves when saved; rejects with a readable message that is shown in the dialog. */
  onSubmit: (input: ProjectInput) => Promise<unknown>;
}

type Errors = Partial<Record<'name' | 'key' | 'description', string>>;

const fieldClass = 'h-11 sm:h-10 bg-white border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-0 shadow-none';

/**
 * Radio group made of native radios (arrow keys and grouping come for free); the visible chip
 * is the label and the focus ring follows the hidden input through `peer`.
 */
const choiceChip = 'flex size-11 cursor-pointer items-center justify-center rounded-lg border-2 border-transparent transition-colors peer-checked:border-slate-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary sm:size-10';

/**
 * Create / edit a project: name, short key (suggested from the name until edited), description, color and icon.
 * Mount with a `key` per project so values reset when the target changes.
 */
const ProjectFormDialog = ({ open, onOpenChange, project, onSubmit }: ProjectFormDialogProps) => {
  const { t } = useTranslation('projects');
  const [name, setName] = useState(project?.name ?? '');
  const [key, setKey] = useState(project?.key ?? '');
  // The key follows the name until the user types their own (always for existing projects)
  const [keyTouched, setKeyTouched] = useState(Boolean(project));
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState<ProjectColor>(project?.color ?? 'blue');
  const [icon, setIcon] = useState<ProjectIcon>(project?.icon ?? 'folder');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const editing = Boolean(project);

  const changeName = (value: string) => {
    setName(value);
    if (!keyTouched) setKey(suggestProjectKey(value));
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.name = t('project.nameRequired');
    else if (name.trim().length > MAX_PROJECT_NAME) next.name = t('project.nameTooLong', { max: MAX_PROJECT_NAME });
    if (key && !isValidProjectKey(key)) next.key = t('project.keyInvalid');
    if (description.length > MAX_PROJECT_DESCRIPTION) next.description = t('project.descriptionTooLong', { max: MAX_PROJECT_DESCRIPTION });
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
      await onSubmit({
        name: name.trim(),
        key: key || undefined,
        description: description.trim(),
        color,
        icon,
      });
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('project.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  const describedBy = (id: string, active: boolean) => (active ? fieldMessageId(id) : undefined);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={editing ? <FolderPen /> : <FolderPlus />}
      title={editing ? t('project.editTitle') : t('project.newTitle')}
      description={editing
        ? t('project.editDescription')
        : t('project.newDescription')}
      onSubmit={handleSubmit}
      submitLabel={editing ? t('sprintForm.saveChanges') : t('project.create')}
      submittingLabel={t('sprintForm.saving')}
      submitting={submitting}
      error={submitError}
      size="md"
    >
      <Field label={t('project.name')} htmlFor="project-name" required error={errors.name}>
        <Input
          id="project-name"
          value={name}
          onChange={event => changeName(event.target.value)}
          placeholder={t('project.namePlaceholder')}
          maxLength={MAX_PROJECT_NAME + 20}
          autoFocus
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy('project-name', Boolean(errors.name))}
          className={fieldClass}
        />
      </Field>

      <Field
        label={t('project.key')}
        htmlFor="project-key"
        error={errors.key}
        hint={t('project.keyHint')}
      >
        <Input
          id="project-key"
          value={key}
          onChange={event => {
            setKeyTouched(true);
            setKey(normalizeProjectKey(event.target.value));
          }}
          placeholder="WEB"
          maxLength={6}
          autoCapitalize="characters"
          aria-invalid={Boolean(errors.key)}
          aria-describedby={fieldMessageId('project-key')}
          className={cn(fieldClass, 'font-mono uppercase sm:w-40')}
        />
      </Field>

      <Field
        label={t('project.description')}
        htmlFor="project-description"
        error={errors.description}
        hint={`${description.length}/${MAX_PROJECT_DESCRIPTION}`}
      >
        <Textarea
          id="project-description"
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder={t('project.descriptionPlaceholder')}
          rows={3}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={fieldMessageId('project-description')}
          className="bg-white border border-slate-300 text-slate-900 shadow-none"
        />
      </Field>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Live preview of the chosen color and icon */}
        <div
          data-testid="project-preview"
          aria-hidden
          className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 sm:w-28"
        >
          <ProjectFolderIcon size="xl" color={color} icon={icon} />
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-slate-700">{t('project.color')}</legend>
            <div className="flex flex-wrap gap-1">
              {PROJECT_COLORS.map(value => (
                <label key={value} className="relative">
                  <input
                    type="radio"
                    name="project-color"
                    value={value}
                    checked={color === value}
                    onChange={() => setColor(value)}
                    className="peer sr-only"
                  />
                  <span aria-hidden className={choiceChip}>
                    <span className={cn('size-7 rounded-full', PROJECT_COLOR_STYLES[value].swatch)} />
                  </span>
                  <span className="sr-only">{t(`colors.${value}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-slate-700">{t('project.icon')}</legend>
            <div className="flex flex-wrap gap-1">
              {PROJECT_ICONS.map(value => (
                <label key={value} className="relative">
                  <input
                    type="radio"
                    name="project-icon"
                    value={value}
                    checked={icon === value}
                    onChange={() => setIcon(value)}
                    className="peer sr-only"
                  />
                  <span aria-hidden className={cn(choiceChip, 'hover:bg-slate-100 peer-checked:bg-white peer-checked:ring-2 peer-checked:ring-slate-900/10')}>
                    <ProjectFolderIcon size="md" color={color} icon={value} />
                  </span>
                  <span className="sr-only">{t(`icons.${value}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </FormDialog>
  );
};

export default ProjectFormDialog;
