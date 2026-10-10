import { Pencil, Trash2 } from 'lucide-react';
import { Surface, Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/features/tasks/lib/date';
import { describeRule, type DescribeContext } from '../lib/describe';
import type { Automation } from '../types';
import { RuleSwitch } from './RuleSwitch';

interface RuleListProps {
  rules: Automation[];
  context?: DescribeContext;
  /** Id of the rule whose switch is being saved */
  busyId?: string | null;
  onToggle: (rule: Automation, enabled: boolean) => void;
  onEdit: (rule: Automation) => void;
  onDelete: (rule: Automation) => void;
}

const runSummary = (rule: Automation, now?: Date): string => {
  if (rule.runCount === 0) return 'Has not run yet';
  const times = `Ran ${rule.runCount} ${rule.runCount === 1 ? 'time' : 'times'}`;
  const last = rule.lastRunAt ? formatRelativeTime(rule.lastRunAt, now) : '';
  return last ? `${times}, last ${last}` : times;
};

const ICON_BUTTON = 'h-10 gap-1.5 px-3 text-sm md:h-9';

/** The rules as cards: sentence, on/off switch, run statistics and edit/delete actions. */
export const RuleList = ({ rules, context, busyId, onToggle, onEdit, onDelete }: RuleListProps) => (
  <ul aria-label="Automation rules" className="space-y-3">
    {rules.map(rule => (
      <li key={rule._id}>
        <Surface as="article" radius="xl" padding="sm" className="space-y-3 sm:p-5" aria-label={rule.name}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-base font-semibold text-slate-900">{rule.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {!rule.enabled && <Tag tone="neutral">Off</Tag>}
                {rule.project && <Tag tone="primary">Project: {rule.project}</Tag>}
              </div>
            </div>
            <RuleSwitch
              checked={rule.enabled}
              label={`${rule.name} is ${rule.enabled ? 'on' : 'off'}`}
              disabled={busyId === rule._id}
              onChange={value => onToggle(rule, value)}
            />
          </div>

          <p className={rule.enabled ? 'text-sm text-slate-700' : 'text-sm text-slate-500'}>
            {describeRule(rule, context)}
          </p>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs tabular-nums text-slate-500">{runSummary(rule)}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onEdit(rule)} className={`${ICON_BUTTON} flex-1 sm:flex-none`}>
                <Pencil aria-hidden />
                Edit<span className="sr-only"> {rule.name}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onDelete(rule)}
                className={`${ICON_BUTTON} flex-1 text-red-700 hover:bg-red-50 sm:flex-none`}
              >
                <Trash2 aria-hidden />
                Delete<span className="sr-only"> {rule.name}</span>
              </Button>
            </div>
          </div>
        </Surface>
      </li>
    ))}
  </ul>
);
