import { AlertTriangle, ListChecks, ListTree, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { TaskTypeIcon } from '@/features/tasks/components/TaskBadges';
import { canAddItem, itemsWithoutCriteria } from '../lib/plan';
import type { PlanContent, PlanItem } from '../types';
import type { PlanActions } from './actions';
import { ItemCard } from './ItemCard';
import { StringListEditor } from './StringListEditor';
import { SubtaskEditor } from './SubtaskEditor';

interface PanelProps {
  plan: PlanContent;
  actions: PlanActions;
}

interface TasksPanelProps extends PanelProps {
  onRemove: (item: PlanItem) => void;
}

/** Every task of the plan in one list, each with the sprint it is in (change it to move the task). */
export const TasksPanel = ({ plan, actions, onRemove }: TasksPanelProps) => {
  const { t } = useTranslation('aiPlan');
  return (
    <div className="space-y-3">
      {plan.items.length === 0 ? (
        <Surface padding="none">
          <EmptyState headingLevel="h3" icon={<ListChecks />} title={t('tasks.emptyTitle')} description={t('tasks.emptyBody')} />
        </Surface>
      ) : (
        <ul aria-label={t('tasks.listLabel')} className="space-y-2">
          {plan.items.map(item => <ItemCard key={item.ref} item={item} plan={plan} actions={actions} onRemove={onRemove} showSprint />)}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={!canAddItem(plan)}
        onClick={() => actions.addItem(null, t('item.newTitle'))}
        className="h-10 gap-1.5 rounded-lg"
      >
        <Plus aria-hidden className="size-4" /> {canAddItem(plan) ? t('tasks.add') : t('tasks.full')}
      </Button>
    </div>
  );
};

const ItemHeading = ({ item }: { item: PlanItem }) => (
  <h3 className="flex min-w-0 items-start gap-2 text-sm font-semibold text-text-strong">
    <span className="mt-0.5 shrink-0"><TaskTypeIcon type={item.type} className="size-4" /></span>
    <span className="min-w-0 break-words">{item.title}</span>
  </h3>
);

/** The subtasks of every task, grouped by task. */
export const SubtasksPanel = ({ plan, actions }: PanelProps) => {
  const { t } = useTranslation('aiPlan');
  if (plan.items.length === 0) {
    return <Surface padding="none"><EmptyState headingLevel="h3" icon={<ListTree />} title={t('tasks.emptyTitle')} description={t('tasks.emptyBody')} /></Surface>;
  }
  return (
    <ul aria-label={t('subtasks.listLabel')} className="space-y-3">
      {plan.items.map(item => (
        <li key={item.ref}>
          <Surface padding="md" className="space-y-3">
            <ItemHeading item={item} />
            <SubtaskEditor item={item} plan={plan} actions={actions} />
          </Surface>
        </li>
      ))}
    </ul>
  );
};

/** The acceptance criteria of every task, grouped by task. */
export const CriteriaPanel = ({ plan, actions }: PanelProps) => {
  const { t } = useTranslation('aiPlan');
  const missing = itemsWithoutCriteria(plan);
  if (plan.items.length === 0) {
    return <Surface padding="none"><EmptyState headingLevel="h3" icon={<ListChecks />} title={t('tasks.emptyTitle')} description={t('tasks.emptyBody')} /></Surface>;
  }
  return (
    <div className="space-y-3">
      {missing > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> {t('criteria.missing', { count: missing })}
        </p>
      )}
      <ul aria-label={t('criteria.listLabel')} className="space-y-3">
        {plan.items.map(item => (
          <li key={item.ref}>
            <Surface padding="md" className="space-y-3">
              <ItemHeading item={item} />
              <StringListEditor
                title={t('criteria.title')}
                items={item.acceptanceCriteria}
                onChange={next => actions.updateItem(item.ref, { acceptanceCriteria: next })}
                rowLabel={index => t('criteria.rowLabel', { number: index + 1, task: item.title })}
                removeLabel={index => t('criteria.remove', { number: index + 1, task: item.title })}
                addLabel={t('criteria.add')}
              />
            </Surface>
          </li>
        ))}
      </ul>
    </div>
  );
};
