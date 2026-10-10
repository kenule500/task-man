import { useId } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Field } from '@/components/ds';
import { fieldMessageId } from '@/components/ds/variants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { OptionSelect } from '@/features/tasks/components/TaskSelects';
import { TASK_STATUSES } from '@/features/tasks/constants';
import type { SelectOption } from '@/features/tasks/constants';
import type { TaskStatus } from '@/features/tasks/types';
import {
  GROUP_LABEL, MAX_STAGE_NAME, STAGE_COLOR_META, parseStageLimit,
} from '../lib/stages';
import { STAGE_COLORS, type StageColor, type WorkflowStage } from '../types';

const GROUP_OPTIONS: SelectOption<TaskStatus>[] = TASK_STATUSES.map(group => ({ value: group, label: GROUP_LABEL[group] }));

const CONTROL = 'h-11 text-base sm:h-9 sm:text-sm';

interface StageRowProps {
  stage: WorkflowStage;
  index: number;
  total: number;
  /** Validation message for the name or the limit */
  problem?: string;
  /** The stage is the only one of its group, so it cannot be deleted. */
  lastOfGroup: boolean;
  onChange: (patch: Partial<WorkflowStage>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

/** One editable stage: name, group, color, WIP limit, order and delete. */
export const StageRow = ({ stage, index, total, problem, lastOfGroup, onChange, onMove, onDelete }: StageRowProps) => {
  const id = useId();
  const nameId = `${id}-name`;
  const limitId = `${id}-limit`;
  const position = `stage ${index + 1} of ${total}`;
  const label = stage.name.trim() || `Stage ${index + 1}`;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-label={`${label}, ${position}`}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_6rem]">
        <Field label="Name" htmlFor={nameId} error={problem}>
          <Input
            id={nameId}
            value={stage.name}
            maxLength={MAX_STAGE_NAME + 10}
            onChange={event => onChange({ name: event.target.value })}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? fieldMessageId(nameId) : undefined}
            placeholder="For example, In review"
            className={CONTROL}
          />
        </Field>
        <div className="space-y-1.5">
          <p id={`${id}-group-label`} className="text-sm font-medium text-slate-700">Group</p>
          <OptionSelect
            aria-label={`Group of ${label}`}
            value={stage.group}
            options={GROUP_OPTIONS}
            onChange={group => onChange({ group })}
            className={cn(CONTROL, 'border-slate-300')}
          />
        </div>
        <Field label="WIP limit" htmlFor={limitId} hint="0 = none">
          <Input
            id={limitId}
            inputMode="numeric"
            value={Number.isNaN(stage.wipLimit) ? '' : String(stage.wipLimit)}
            onChange={event => onChange({ wipLimit: parseStageLimit(event.target.value) })}
            className={cn(CONTROL, 'tabular-nums')}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={`Color of ${label}`} className="flex flex-wrap items-center gap-1">
          {STAGE_COLORS.map((color: StageColor) => {
            const selected = stage.color === color;
            return (
              <button
                key={color}
                type="button"
                aria-pressed={selected}
                aria-label={STAGE_COLOR_META[color].label}
                title={STAGE_COLOR_META[color].label}
                onClick={() => onChange({ color })}
                className="inline-flex size-10 items-center justify-center rounded-lg outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary sm:size-8"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-5 rounded-full ring-offset-2 ring-offset-white sm:size-4',
                    STAGE_COLOR_META[color].dot,
                    selected && 'ring-2 ring-slate-700',
                  )}
                />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${label} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="size-11 text-slate-600 sm:size-8"
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${label} down`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="size-11 text-slate-600 sm:size-8"
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={lastOfGroup ? `${label} is the only stage in ${GROUP_LABEL[stage.group]}` : `Delete ${label}`}
            title={lastOfGroup ? `Every group needs at least one stage` : undefined}
            disabled={lastOfGroup}
            onClick={onDelete}
            className="size-11 text-danger-fg hover:bg-danger-bg sm:size-8"
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
    </li>
  );
};
