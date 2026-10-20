import { useId } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field, OptionCombobox } from '@/components/ds';
import type { Project } from '@/features/projects';
import { activeTargets } from '../lib/destination';

interface ProjectPickerProps {
  slug: string;
  projects: Project[];
  loading: boolean;
  value: string | null;
  onChange: (projectId: string | null) => void;
  error?: string;
  /** Move focus into the search input when the selector is revealed. */
  autoFocus?: boolean;
}

/** Searchable list of the workspace's active projects, showing name and key. */
export const ProjectPicker = ({ slug, projects, loading, value, onChange, error, autoFocus }: ProjectPickerProps) => {
  const { t } = useTranslation('aiPlan');
  const id = useId();
  const targets = activeTargets(projects);
  // A deleted or archived target is not offered; show the placeholder instead of a stale id.
  const selected = value && targets.some(project => project._id === value) ? value : null;

  if (loading) {
    return <p role="status" className="min-h-11 text-sm text-text-subtle sm:min-h-9">{t('destination.projectsLoading')}</p>;
  }

  if (targets.length === 0) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-sunken px-3 py-3 text-sm text-text-body">
          <p className="flex items-center gap-2 font-medium text-text-strong">
            <FolderKanban aria-hidden className="size-4 text-text-subtle" /> {t('destination.noProjectsTitle')}
          </p>
          <p className="mt-1">{t('destination.noProjectsBody')}</p>
          <Link to={`/${slug}/projects`} className="mt-2 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2 sm:min-h-0">
            {t('destination.createProject')}
          </Link>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-danger-fg">{error}</p>}
      </div>
    );
  }

  return (
    <Field label={t('destination.projectLabel')} htmlFor={id} hint={t('destination.projectHint')} error={error}>
      <OptionCombobox
        id={id}
        label={t('destination.projectLabel')}
        options={targets.map(project => ({ value: project._id, label: project.name, description: project.key }))}
        value={selected}
        onValueChange={next => onChange(next ?? null)}
        placeholder={t('destination.projectPlaceholder')}
        emptyText={t('destination.noMatches')}
        invalid={Boolean(error)}
        aria-describedby={`${id}-message`}
        autoFocus={autoFocus}
        className="max-md:min-h-11"
      />
    </Field>
  );
};
