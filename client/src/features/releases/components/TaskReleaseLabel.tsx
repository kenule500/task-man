import { Link, useParams } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReleases } from '../hooks/useReleases';

interface TaskReleaseLabelProps {
  /** Release id of the task; unset renders "None". */
  releaseId?: string | null;
}

/** Name of the task's release (a link to its page) for the details block of a task. */
const TaskReleaseLabel = ({ releaseId }: TaskReleaseLabelProps) => {
  const { t } = useTranslation('projects');
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  // Only tasks that have a release need the list
  const { releases } = useReleases(workspaceSlug, Boolean(releaseId));
  if (!releaseId) return <span className="text-slate-500">{t('releases.field.none')}</span>;

  const release = releases.find(item => item._id === releaseId);
  if (!release || !workspaceSlug) return <span>{t('releases.field.label')}</span>;
  return (
    <Link
      to={`/${workspaceSlug}/projects/${release.project}/releases/${release._id}`}
      className="inline-flex min-w-0 items-center gap-1.5 rounded text-primary outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <Rocket aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{release.name}</span>
    </Link>
  );
};

export default TaskReleaseLabel;
