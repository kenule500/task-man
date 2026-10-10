import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { GROUP_LABEL, STAGE_COLOR_META, resolveStage, stagesByGroup } from '@/features/workflow/lib/stages';
import { useWorkflow } from '@/features/workflow/hooks/useWorkflow';
import type { Project } from '@/features/projects';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TASK_TYPE_OPTIONS, type SelectOption } from '../constants';
import {
  BACKLOG_VALUE, NO_ESTIMATE_VALUE, findProjectByName, parseStoryPoints, sprintOptionsFor, storyPointOptions,
} from '../lib/taskForm';
import type { TaskPriority, TaskStatus, TaskType } from '../types';

const OptionDot = ({ className }: { className?: string }) =>
  className ? <span aria-hidden className={cn('size-2 shrink-0 rounded-full', className)} /> : null;

interface OptionSelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  'aria-label': string;
  /** `field` for forms and toolbars, `inline` for compact in-row editing */
  variant?: 'field' | 'inline';
  icon?: ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}

const TRIGGER_STYLES = {
  field: 'h-9 w-full bg-white border-slate-200 text-sm text-slate-700 shadow-none',
  inline: 'h-7 rounded-md border-transparent bg-transparent px-2 text-xs font-medium text-slate-700 hover:brightness-95 data-popup-open:ring-2 data-popup-open:ring-primary/20',
};

/** Generic single-value select built on the shadcn (Base UI) Select primitive. */
export function OptionSelect<T extends string>({
  value, options, onChange, variant = 'field', icon, id, disabled, className, ...rest
}: OptionSelectProps<T>) {
  const selected = options.find(option => option.value === value);

  return (
    <Select
      value={value}
      onValueChange={next => next && onChange(next as T)}
      items={options.map(({ value, label }) => ({ value, label }))}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={rest['aria-label']} className={cn(TRIGGER_STYLES[variant], variant === 'inline' && selected?.tone, className)}>
        {icon}
        <SelectValue>
          {() => (
            <>
              <OptionDot className={selected?.dot} />
              {selected?.label}
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value} className="text-slate-700">
            <OptionDot className={option.dot} />
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type PresetSelectProps<T extends string> = Omit<OptionSelectProps<T>, 'options' | 'aria-label'> & { 'aria-label'?: string };

interface StageSelectProps {
  /** Status of the task; with `stage` it tells which stage is shown. */
  status: TaskStatus;
  stage?: string;
  /** Called with the chosen stage key (the status follows from its group). */
  onChange: (stageKey: string) => void;
  'aria-label': string;
  variant?: 'field' | 'inline';
  id?: string;
  disabled?: boolean;
  className?: string;
}

/** Workflow stages grouped by status group (Not started, In progress, Finished), each with its colored dot. */
export const StageSelect = ({ status, stage, onChange, variant = 'field', id, disabled, className, ...rest }: StageSelectProps) => {
  const { stages } = useWorkflow();
  const current = resolveStage({ status, stage }, stages);
  const groups = stagesByGroup(stages);

  return (
    <Select
      value={current.key}
      onValueChange={next => next && onChange(next)}
      items={stages.map(({ key, name }) => ({ value: key, label: name }))}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={rest['aria-label']} className={cn(TRIGGER_STYLES[variant], variant === 'inline' && 'border border-slate-200 bg-slate-100', className)}>
        <SelectValue>
          {() => (
            <>
              <OptionDot className={STAGE_COLOR_META[current.color].dot} />
              {current.name}
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {groups.map(entry => (
          <SelectGroup key={entry.group}>
            <SelectLabel>{GROUP_LABEL[entry.group]}</SelectLabel>
            {entry.stages.map(item => (
              <SelectItem key={item.key} value={item.key} className="text-slate-700">
                <OptionDot className={STAGE_COLOR_META[item.color].dot} />
                {item.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
};

type StatusSelectProps = PresetSelectProps<TaskStatus> & {
  /** Current stage key of the task. */
  stage?: string;
  /** When given and the workspace workflow is loaded, the select lists the stages and calls this instead of `onChange`. */
  onStageChange?: (stageKey: string) => void;
};

/** Status picker; shows the workspace stages (grouped by status) when the caller can handle them. */
export const StatusSelect = ({ 'aria-label': label = 'Status', stage, onStageChange, ...props }: StatusSelectProps) => {
  const { loaded } = useWorkflow();
  if (loaded && onStageChange) {
    return (
      <StageSelect
        status={props.value}
        stage={stage}
        onChange={onStageChange}
        aria-label={label}
        variant={props.variant}
        id={props.id}
        disabled={props.disabled}
        className={props.className}
      />
    );
  }
  return <OptionSelect options={STATUS_OPTIONS} aria-label={label} {...props} />;
};

export const PrioritySelect = ({ 'aria-label': label = 'Priority', ...props }: PresetSelectProps<TaskPriority>) => (
  <OptionSelect options={PRIORITY_OPTIONS} aria-label={label} {...props} />
);

export const TypeSelect = ({ 'aria-label': label = 'Type', ...props }: PresetSelectProps<TaskType>) => (
  <OptionSelect options={TASK_TYPE_OPTIONS} aria-label={label} {...props} />
);

interface StoryPointsSelectProps extends Omit<PresetSelectProps<string>, 'options' | 'value' | 'onChange'> {
  /** null = not estimated */
  value: number | null;
  onChange: (value: number | null) => void;
}

/** Fibonacci estimates; an off-scale value from the API is kept as an extra option. */
export const StoryPointsSelect = ({ value, onChange, 'aria-label': label = 'Story points', ...props }: StoryPointsSelectProps) => (
  <OptionSelect
    options={storyPointOptions(value)}
    value={value === null ? NO_ESTIMATE_VALUE : String(value)}
    onChange={next => onChange(parseStoryPoints(next))}
    aria-label={label}
    {...props}
  />
);

interface SprintSelectProps extends Omit<PresetSelectProps<string>, 'options' | 'value' | 'onChange'> {
  projects: Project[];
  /** Project name of the task; sprints are listed for this project only. */
  project: string;
  /** Sprint id, '' = backlog */
  value: string;
  onChange: (sprintId: string) => void;
}

/** Backlog plus the planned and active sprints of the task's project; disabled without a (known) project. */
export const SprintSelect = ({ projects, project, value, onChange, disabled, 'aria-label': label = 'Sprint', ...props }: SprintSelectProps) => {
  const known = Boolean(findProjectByName(projects, project));
  return (
    <OptionSelect
      options={sprintOptionsFor(projects, project, value)}
      value={value || BACKLOG_VALUE}
      onChange={next => onChange(next === BACKLOG_VALUE ? '' : next)}
      aria-label={label}
      disabled={disabled || !known}
      {...props}
    />
  );
};
