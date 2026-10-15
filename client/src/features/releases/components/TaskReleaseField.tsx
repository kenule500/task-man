import { useParams } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import type { Project } from '@/features/projects';
import { OptionSelect } from '@/features/tasks/components/TaskSelects';
import { useReleases } from '../hooks/useReleases';
import { NO_RELEASE_VALUE, releaseOptionsFor } from '../lib/progress';

interface TaskReleaseFieldProps {
  /** Project name of the task being edited. */
  project: string;
  projects: Project[];
  /** Release id, '' = none */
  value: string;
  onChange: (releaseId: string) => void;
  /** Subtasks follow the release of their parent. */
  isSubtask?: boolean;
  className?: string;
}

/**
 * Release select of the task form: the unreleased releases of the task's project. Renders nothing while the
 * project has no release to offer (and the task is in none), so projects that do not use releases see no change.
 */
const TaskReleaseField = ({ project, projects, value, onChange, isSubtask = false, className }: TaskReleaseFieldProps) => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { releases } = useReleases(workspaceSlug);
  const projectId = projects.find(item => item.name === project.trim())?._id;
  const options = releaseOptionsFor(releases, projectId, value);
  if (options.length <= 1) return null;
  const current = releases.find(item => item._id === value);
  const hint = isSubtask
    ? 'Subtasks follow the release of their parent task.'
    : current && current.project !== projectId ? 'This release belongs to another project.' : '';

  return (
    <div className={className ?? 'space-y-1.5 sm:col-span-2'}>
      <Label htmlFor="task-release" className="text-sm font-medium text-slate-700">Release</Label>
      <OptionSelect
        id="task-release"
        aria-label="Release"
        value={value || NO_RELEASE_VALUE}
        options={options}
        onChange={next => onChange(next === NO_RELEASE_VALUE ? '' : next)}
        disabled={isSubtask}
        className="h-11 border-slate-300 sm:h-10"
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
};

export default TaskReleaseField;
