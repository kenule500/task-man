import { useId, useState } from 'react';
import { ChevronDown, ListChecks, ListTree, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRIORITY_OPTIONS, TASK_TYPE_OPTIONS, type SelectOption } from '@/features/tasks/constants';
import { OptionSelect } from '@/features/tasks/components/TaskSelects';
import { TaskTypeIcon } from '@/features/tasks/components/TaskBadges';
import { BACKLOG, NO_POINTS, usePointOptions, useSprintOptions } from '../hooks/usePlanOptions';
import { PLAN_LIMITS } from '../lib/plan';
import type { PlanContent, PlanItem, PlanItemType } from '../types';
import type { PlanActions } from './actions';
import { EditableText } from './EditableText';
import { StringListEditor } from './StringListEditor';
import { SubtaskEditor } from './SubtaskEditor';

const TYPE_OPTIONS = TASK_TYPE_OPTIONS.filter((option): option is SelectOption<PlanItemType> => option.value !== 'epic');

interface ItemCardProps {
  item: PlanItem;
  plan: PlanContent;
  actions: PlanActions;
  /** Removes the item (the parent shows the Undo toast). */
  onRemove: (item: PlanItem) => void;
  /** Show which sprint the item is in on the summary line (the Tasks tab). */
  showSprint?: boolean;
}

/** One planned item: type, title, points and priority editable in place; details (description, type, sprint, subtasks, criteria) unfold. */
export const ItemCard = ({ item, plan, actions, onRemove, showSprint = false }: ItemCardProps) => {
  const { t } = useTranslation('aiPlan');
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const pointOptions = usePointOptions();
  const sprintOptions = useSprintOptions(plan);
  const epic = item.epicRef ? plan.epics.find(entry => entry.ref === item.epicRef) : undefined;
  const sprintValue = item.sprintIndex === null ? BACKLOG : String(item.sprintIndex);
  const noCriteria = item.acceptanceCriteria.length === 0;

  return (
    <li className="rounded-xl border border-slate-200 bg-surface-raised">
      <div className="flex items-start gap-2 p-3">
        <span className="mt-1.5 shrink-0"><TaskTypeIcon type={item.type} className="size-4" /></span>
        <div className="min-w-0 flex-1 space-y-2">
          <EditableText
            value={item.title}
            label={t('item.titleLabel', { title: item.title })}
            maxLength={PLAN_LIMITS.title}
            required
            onSave={title => actions.updateItem(item.ref, { title })}
            className="text-sm font-medium text-text-strong"
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <OptionSelect
              variant="inline"
              aria-label={t('item.pointsLabel', { title: item.title })}
              value={item.storyPoints === null ? NO_POINTS : String(item.storyPoints)}
              options={pointOptions}
              onChange={value => actions.updateItem(item.ref, { storyPoints: value === NO_POINTS ? null : Number(value) })}
              className="max-md:h-10 border-slate-200 bg-slate-100"
            />
            <OptionSelect
              variant="inline"
              aria-label={t('item.priorityLabel', { title: item.title })}
              value={item.priority}
              options={PRIORITY_OPTIONS}
              onChange={priority => actions.updateItem(item.ref, { priority })}
              className="max-md:h-10"
            />
            {showSprint && (
              <OptionSelect
                variant="inline"
                aria-label={t('item.moveLabel', { title: item.title })}
                value={sprintValue}
                options={sprintOptions}
                onChange={value => actions.moveItem(item.ref, value === BACKLOG ? null : Number(value))}
                className="max-md:h-10 border-slate-200"
              />
            )}
            <span className="inline-flex items-center gap-1 text-xs text-text-subtle" title={t('item.subtasksCount', { count: item.subtasks.length })}>
              <ListTree aria-hidden className="size-3.5" />
              <span className="tabular-nums">{item.subtasks.length}</span>
              <span className="sr-only">{t('item.subtasksCount', { count: item.subtasks.length })}</span>
            </span>
            <span
              className={cn('inline-flex items-center gap-1 text-xs', noCriteria ? 'font-medium text-warning-fg' : 'text-text-subtle')}
              title={t('item.criteriaCount', { count: item.acceptanceCriteria.length })}
            >
              <ListChecks aria-hidden className="size-3.5" />
              <span className="tabular-nums">{item.acceptanceCriteria.length}</span>
              <span className="sr-only">{t('item.criteriaCount', { count: item.acceptanceCriteria.length })}</span>
            </span>
            {epic && <span className="max-w-full truncate rounded-md bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700">{epic.title}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('item.remove', { title: item.title })}
            onClick={() => onRemove(item)}
            className="size-10 text-text-subtle hover:text-danger-fg md:size-9"
          >
            <Trash2 aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={open ? t('item.hideDetails', { title: item.title }) : t('item.showDetails', { title: item.title })}
            onClick={() => setOpen(current => !current)}
            className="size-10 text-text-subtle md:size-9"
          >
            <ChevronDown aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {open && (
        <div id={detailsId} className="space-y-4 border-t border-slate-100 p-3 sm:p-4">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-text-strong">{t('item.description')}</h4>
            <EditableText
              multiline
              value={item.description}
              label={t('item.descriptionLabel', { title: item.title })}
              maxLength={PLAN_LIMITS.description}
              placeholder={t('item.noDescription')}
              onSave={description => actions.updateItem(item.ref, { description })}
              className="text-sm text-text-body"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>{t('item.type')}</span>
              <OptionSelect
                aria-label={t('item.typeLabel', { title: item.title })}
                value={item.type}
                options={TYPE_OPTIONS}
                onChange={type => actions.updateItem(item.ref, { type })}
                className="max-md:h-10"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>{t('item.sprint')}</span>
              <OptionSelect
                aria-label={t('item.moveLabel', { title: item.title })}
                value={sprintValue}
                options={sprintOptions}
                onChange={value => actions.moveItem(item.ref, value === BACKLOG ? null : Number(value))}
                className="max-md:h-10"
              />
            </label>
          </div>
          <StringListEditor
            title={t('criteria.title')}
            items={item.acceptanceCriteria}
            onChange={next => actions.updateItem(item.ref, { acceptanceCriteria: next })}
            rowLabel={index => t('criteria.rowLabel', { number: index + 1, task: item.title })}
            removeLabel={index => t('criteria.remove', { number: index + 1, task: item.title })}
            addLabel={t('criteria.add')}
          />
          <SubtaskEditor item={item} plan={plan} actions={actions} />
        </div>
      )}
    </li>
  );
};
