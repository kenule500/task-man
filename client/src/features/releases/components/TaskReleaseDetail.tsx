import { useParams } from 'react-router-dom';
import { DescriptionItem } from '@/components/ds';
import type { Project } from '@/features/projects';
import { OptionSelect } from '@/features/tasks/components/TaskSelects';
import { useReleases } from '../hooks/useReleases';
import { NO_RELEASE_VALUE, releaseOptionsFor } from '../lib/progress';
import TaskReleaseLabel from './TaskReleaseLabel';

interface TaskReleaseDetailProps {
  task: { release?: string | null; project?: string; parent?: string | null };
  projects: Project[];
  /** May change the release (holds the right to edit fields). */
  canEdit: boolean;
  onChange: (releaseId: string | null) => unknown;
}

/**
 * "Release" row of the task details: a select for editors, the release name (linked) otherwise.
 * Hidden while the task has no release and its project has none to offer.
 */
const TaskReleaseDetail = ({ task, projects, canEdit, onChange }: TaskReleaseDetailProps) => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { releases } = useReleases(workspaceSlug);
  const projectId = projects.find(item => item.name === task.project?.trim())?._id;
  const options = releaseOptionsFor(releases, projectId, task.release ?? '');
  if (!task.release && options.length <= 1) return null;

  return (
    <DescriptionItem label="Release">
      {canEdit && !task.parent ? (
        <OptionSelect
          aria-label="Release"
          value={task.release || NO_RELEASE_VALUE}
          options={options}
          onChange={next => { void onChange(next === NO_RELEASE_VALUE ? null : next); }}
          className="h-11 md:h-8"
        />
      ) : (
        <TaskReleaseLabel releaseId={task.release} />
      )}
    </DescriptionItem>
  );
};

export default TaskReleaseDetail;
