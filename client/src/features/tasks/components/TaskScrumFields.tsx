import type { Project } from '@/features/projects';
import { Label } from '@/components/ui/label';
import { epicFitsProject, epicOptionsFor, findProjectByName, NO_EPIC_VALUE, type TaskFormValues } from '../lib/taskForm';
import type { Task } from '../types';
import { OptionSelect, SprintSelect, StoryPointsSelect, TypeSelect } from './TaskSelects';

interface TaskScrumFieldsProps {
  values: Pick<TaskFormValues, 'type' | 'storyPoints' | 'sprint' | 'project' | 'epic'>;
  onChange: <K extends 'type' | 'storyPoints' | 'sprint' | 'epic' | 'project'>(key: K, value: TaskFormValues[K]) => void;
  projects: Project[];
  /** Epics of the workspace; the epic field is hidden when there are none. */
  epics?: Task[];
  /** Subtasks follow their parent's sprint and epic, so these cannot be chosen. */
  isSubtask?: boolean;
}

const selectClass = 'h-11 border-slate-300 sm:h-10';
const labelClass = 'text-sm font-medium text-slate-700';

/** Type, story points, epic and sprint of a task, as used by the task form. */
const TaskScrumFields = ({ values, onChange, projects, epics = [], isSubtask = false }: TaskScrumFieldsProps) => {
  const isEpic = values.type === 'epic';
  const hasProject = Boolean(findProjectByName(projects, values.project));
  const sprintHintId = 'task-sprint-hint';
  const sprintHint = isSubtask
    ? 'Subtasks follow the sprint of their parent task.'
    : !hasProject ? 'Pick one of your projects to plan this task into a sprint.' : '';
  const showEpic = !isEpic && epics.length > 0;

  const changeType = (type: TaskFormValues['type']) => {
    onChange('type', type);
    // Epics are containers: they have no epic and are not planned into a sprint
    if (type === 'epic') {
      onChange('epic', '');
      onChange('sprint', '');
    }
  };

  const changeEpic = (id: string) => {
    const epicId = id === NO_EPIC_VALUE ? '' : id;
    onChange('epic', epicId);
    // An item without project joins the project of its epic
    const epic = epics.find(item => item._id === epicId);
    if (epic && !values.project.trim() && epic.project) onChange('project', epic.project);
  };

  const current = epics.find(item => item._id === values.epic);
  const epicHint = isSubtask
    ? 'Subtasks belong to the epic of their parent task.'
    : current && !epicFitsProject(current, values.project) ? 'This epic belongs to another project.' : '';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="task-type" className={labelClass}>Type</Label>
        <TypeSelect id="task-type" value={values.type} onChange={changeType} className={selectClass} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="task-points" className={labelClass}>Story points</Label>
        <StoryPointsSelect id="task-points" value={values.storyPoints} onChange={value => onChange('storyPoints', value)} className={selectClass} />
      </div>
      {showEpic && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="task-epic" className={labelClass}>Epic</Label>
          <OptionSelect
            id="task-epic"
            aria-label="Epic"
            value={values.epic || NO_EPIC_VALUE}
            options={epicOptionsFor(epics, values.project, values.epic)}
            onChange={changeEpic}
            disabled={isSubtask}
            className={selectClass}
          />
          {epicHint && <p className="text-xs text-slate-500">{epicHint}</p>}
        </div>
      )}
      {isEpic ? (
        <p className="text-xs text-slate-500 sm:col-span-2">
          An epic groups stories, tasks, bugs and spikes of its project across sprints. It is not planned into a sprint itself.
        </p>
      ) : (
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
      )}
    </div>
  );
};

export default TaskScrumFields;
