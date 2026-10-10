import type { Project } from '@/features/projects';
import { Label } from '@/components/ui/label';
import { findProjectByName, type TaskFormValues } from '../lib/taskForm';
import { SprintSelect, StoryPointsSelect, TypeSelect } from './TaskSelects';

interface TaskScrumFieldsProps {
  values: Pick<TaskFormValues, 'type' | 'storyPoints' | 'sprint' | 'project'>;
  onChange: <K extends 'type' | 'storyPoints' | 'sprint'>(key: K, value: TaskFormValues[K]) => void;
  projects: Project[];
  /** Subtasks follow their parent's sprint, so the sprint cannot be chosen. */
  isSubtask?: boolean;
}

const selectClass = 'h-11 border-slate-300 sm:h-10';
const labelClass = 'text-sm font-medium text-slate-700';

/** Type, story points and sprint of a task, as used by the task form. */
const TaskScrumFields = ({ values, onChange, projects, isSubtask = false }: TaskScrumFieldsProps) => {
  const hasProject = Boolean(findProjectByName(projects, values.project));
  const sprintHintId = 'task-sprint-hint';
  const sprintHint = isSubtask
    ? 'Subtasks follow the sprint of their parent task.'
    : !hasProject ? 'Pick one of your projects to plan this task into a sprint.' : '';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="task-type" className={labelClass}>Type</Label>
        <TypeSelect id="task-type" value={values.type} onChange={value => onChange('type', value)} className={selectClass} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="task-points" className={labelClass}>Story points</Label>
        <StoryPointsSelect id="task-points" value={values.storyPoints} onChange={value => onChange('storyPoints', value)} className={selectClass} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="task-sprint" className={labelClass}>Sprint</Label>
        <SprintSelect
          id="task-sprint"
          projects={projects}
          project={values.project}
          value={values.sprint}
          onChange={value => onChange('sprint', value)}
          disabled={isSubtask}
          className={selectClass}
        />
        {sprintHint && <p id={sprintHintId} className="text-xs text-slate-500">{sprintHint}</p>}
      </div>
    </div>
  );
};

export default TaskScrumFields;
