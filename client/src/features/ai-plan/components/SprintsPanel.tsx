import { useId, useState } from 'react';
import { CalendarDays, ChevronDown, Inbox, Plus, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate } from '@/features/tasks/lib/date';
import { canAddItem, groupBySprint, PLAN_LIMITS, weekRange, type SprintGroup } from '../lib/plan';
import type { PlanContent, PlanItem } from '../types';
import type { PlanActions } from './actions';
import { EditableText } from './EditableText';
import { ItemCard } from './ItemCard';

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

interface SprintSectionProps {
  group: SprintGroup;
  plan: PlanContent;
  weeks: number;
  actions: PlanActions;
  onRemove: (item: PlanItem) => void;
}

const SprintSection = ({ group, plan, weeks, actions, onRemove }: SprintSectionProps) => {
  const { t } = useTranslation('aiPlan');
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const { sprint, sprintIndex } = group;
  const name = sprint ? (sprint.name || t('sprint.unnamed', { number: (sprintIndex ?? 0) + 1 })) : t('sprint.backlog');
  const range = sprintIndex !== null ? weekRange(sprintIndex, weeks) : null;

  return (
    <Surface as="section" padding="none" aria-label={name} className="overflow-hidden">
      <div className="space-y-2 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? t('sprint.collapse', { name }) : t('sprint.expand', { name })}
            onClick={() => setOpen(current => !current)}
            className="size-10 shrink-0 text-text-subtle md:size-9"
          >
            <ChevronDown aria-hidden className={cn('transition-transform', open ? '' : '-rotate-90 rtl:rotate-90')} />
          </Button>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {sprint && sprintIndex !== null ? (
                <h3 className="min-w-0 flex-1 text-base font-semibold text-text-strong sm:flex-none">
                  <EditableText
                    value={sprint.name}
                    label={t('sprint.nameLabel', { name })}
                    maxLength={PLAN_LIMITS.sprintName}
                    required
                    onSave={next => actions.updateSprint(sprintIndex, { name: next })}
                  />
                </h3>
              ) : (
                <h3 className="inline-flex items-center gap-2 text-base font-semibold text-text-strong"><Inbox aria-hidden className="size-4 text-text-subtle" /> {name}</h3>
              )}
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-subtle">
                {sprint && range && (
                  <>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <CalendarDays aria-hidden className="size-3.5" />
                      {formatDate(sprint.startDate, SHORT_DATE)} – {formatDate(sprint.endDate, SHORT_DATE)}
                    </span>
                    <span>{range.from === range.to ? t('sprint.week', { number: range.from }) : t('sprint.weeks', { from: range.from, to: range.to })}</span>
                  </>
                )}
                <span className="tabular-nums">{t('sprint.tasks', { count: group.items.length })}</span>
                <span className="tabular-nums">{t('sprint.points', { count: group.points })}</span>
              </p>
            </div>
            {sprint && sprintIndex !== null ? (
              <div className="flex items-start gap-1.5 text-sm text-text-body">
                <Target aria-hidden className="mt-1.5 size-3.5 shrink-0 text-text-subtle" />
                <EditableText
                  value={sprint.goal}
                  label={t('sprint.goalLabel', { name })}
                  maxLength={PLAN_LIMITS.sprintGoal}
                  placeholder={t('sprint.noGoal')}
                  onSave={next => actions.updateSprint(sprintIndex, { goal: next })}
                />
              </div>
            ) : (
              <p className="text-sm text-text-body">{t('sprint.backlogHint')}</p>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div id={bodyId} className="space-y-2 border-t border-slate-100 bg-surface-sunken/50 p-3 sm:p-4">
          {group.items.length === 0 ? (
            <p className="px-1 py-2 text-sm text-text-subtle">{t('sprint.empty')}</p>
          ) : (
            <ul aria-label={t('sprint.itemsLabel', { name })} className="space-y-2">
              {group.items.map(item => (
                <ItemCard key={item.ref} item={item} plan={plan} actions={actions} onRemove={onRemove} />
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canAddItem(plan)}
            onClick={() => actions.addItem(sprintIndex, t('item.newTitle'))}
            className="h-10 gap-1.5 px-2 text-primary md:h-8"
          >
            <Plus aria-hidden className="size-3.5" /> {t('item.add', { name })}
          </Button>
        </div>
      )}
    </Surface>
  );
};

interface SprintsPanelProps {
  plan: PlanContent;
  weeks: number;
  actions: PlanActions;
  onRemove: (item: PlanItem) => void;
}

/** The plan sprint by sprint, each a collapsible section with its tasks, then the backlog. */
export const SprintsPanel = ({ plan, weeks, actions, onRemove }: SprintsPanelProps) => (
  <div className="space-y-4">
    {groupBySprint(plan).map(group => (
      <SprintSection key={group.sprintIndex ?? 'backlog'} group={group} plan={plan} weeks={weeks} actions={actions} onRemove={onRemove} />
    ))}
  </div>
);
