import { useState, type FormEvent } from 'react';
import { FolderPlus, FolderPen } from 'lucide-react';
import FormDialog from '@/components/FormDialog';
import { Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PROJECT_COLORS, PROJECT_ICONS, type Project, type ProjectColor, type ProjectIcon, type ProjectInput } from '../types';
import { PROJECT_COLOR_STYLES } from '../lib/appearance';
import { PROJECT_ICON_COMPONENTS, PROJECT_ICON_LABELS } from '../lib/icons';
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

const fieldClass = 'h-11 sm:h-10 bg-white border border-gray-300 rounded-lg text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none';

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
    if (!name.trim()) next.name = 'Enter a project name.';
    else if (name.trim().length > MAX_PROJECT_NAME) next.name = `Keep the name under ${MAX_PROJECT_NAME} characters.`;
    if (key && !isValidProjectKey(key)) next.key = 'Use 2 to 6 letters or digits, for example WEB.';
    if (description.length > MAX_PROJECT_DESCRIPTION) next.description = `Keep the description under ${MAX_PROJECT_DESCRIPTION} characters.`;
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
      setSubmitError(err instanceof Error ? err.message : 'Could not save the project.');
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
      title={editing ? 'Edit project' : 'New project'}
      description={editing
        ? 'Rename it, change its look or update the description. Tasks follow a renamed project.'
        : 'A project groups sprints and tasks. Pick a color and icon so it is easy to spot.'}
      onSubmit={handleSubmit}
      submitLabel={editing ? 'Save changes' : 'Create project'}
      submittingLabel="Saving..."
      submitting={submitting}
      error={submitError}
      size="md"
    >
      <Field label="Name" htmlFor="project-name" required error={errors.name}>
        <Input
          id="project-name"
          value={name}
          onChange={event => changeName(event.target.value)}
          placeholder="Website redesign"
          maxLength={MAX_PROJECT_NAME + 20}
          autoFocus
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy('project-name', Boolean(errors.name))}
          className={fieldClass}
        />
      </Field>

      <Field
        label="Key"
        htmlFor="project-key"
        error={errors.key}
        hint="A short code shown next to the project. Suggested from the name."
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
        label="Description"
        htmlFor="project-description"
        error={errors.description}
        hint={`${description.length}/${MAX_PROJECT_DESCRIPTION}`}
      >
        <Textarea
          id="project-description"
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="What is this project about?"
          rows={3}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={fieldMessageId('project-description')}
          className="bg-white border border-gray-300 text-slate-900 shadow-none"
        />
      </Field>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-slate-700">Color</legend>
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
              <span className="sr-only">{PROJECT_COLOR_STYLES[value].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-slate-700">Icon</legend>
        <div className="flex flex-wrap gap-1">
          {PROJECT_ICONS.map(value => {
            const Icon = PROJECT_ICON_COMPONENTS[value];
            return (
              <label key={value} className="relative">
                <input
                  type="radio"
                  name="project-icon"
                  value={value}
                  checked={icon === value}
                  onChange={() => setIcon(value)}
                  className="peer sr-only"
                />
                <span aria-hidden className={cn(choiceChip, 'bg-slate-100 text-slate-700 peer-checked:bg-white')}>
                  <Icon className="size-5" />
                </span>
                <span className="sr-only">{PROJECT_ICON_LABELS[value]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </FormDialog>
  );
};

export default ProjectFormDialog;
