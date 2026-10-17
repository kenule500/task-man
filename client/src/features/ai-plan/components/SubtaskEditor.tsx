import { useId, useState } from 'react';
import { ChevronDown, ListChecks, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { canAddSubtask, PLAN_LIMITS } from '../lib/plan';
import type { PlanContent, PlanItem } from '../types';
import type { PlanActions } from './actions';
import { StringListEditor } from './StringListEditor';

interface SubtaskEditorProps {
  item: PlanItem;
  plan: PlanContent;
  actions: PlanActions;
}

/** The subtasks of one item: title fields, remove buttons, each with its own acceptance criteria, and an add button. */
export const SubtaskEditor = ({ item, plan, actions }: SubtaskEditorProps) => {
  const { t } = useTranslation('aiPlan');
  const baseId = useId();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const canAdd = canAddSubtask(plan, item.ref);

  const toggle = (index: number) => setOpen(current => {
    const next = new Set(current);
    if (!next.delete(index)) next.add(index);
    return next;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-text-strong">{t('subtasks.title')}</h4>
        <span className="text-xs tabular-nums text-text-subtle">{item.subtasks.length}/{PLAN_LIMITS.subtasksPerItem}</span>
      </div>
      {item.subtasks.length === 0 && <p className="text-xs text-text-subtle">{t('subtasks.empty')}</p>}
      <ul className="space-y-2">
        {item.subtasks.map((subtask, index) => {
          const panelId = `${baseId}-${index}`;
          const expanded = open.has(index);
          return (
            <li key={index} className="rounded-lg border border-border-subtle bg-surface-sunken p-2">
              <div className="flex items-center gap-1.5">
                <Input
                  value={subtask.title}
                  maxLength={PLAN_LIMITS.title}
                  aria-label={t('subtasks.rowLabel', { number: index + 1, task: item.title })}
                  onChange={event => actions.updateSubtask(item.ref, index, { title: event.target.value })}
                  className="h-10 min-w-0 flex-1 rounded-lg border-border-strong bg-surface-raised text-base shadow-none md:h-9 md:text-sm"
                />
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  aria-label={t('subtasks.criteriaToggle', { number: index + 1, count: subtask.acceptanceCriteria.length })}
                  className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-text-body outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-primary md:h-9"
                >
                  <ListChecks aria-hidden className="size-3.5" />
                  <span className="tabular-nums">{subtask.acceptanceCriteria.length}</span>
                  <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('subtasks.remove', { number: index + 1, task: item.title })}
                  onClick={() => actions.removeSubtask(item.ref, index)}
                  className="size-10 shrink-0 text-text-subtle hover:text-danger-fg md:size-9"
                >
                  <X aria-hidden />
                </Button>
              </div>
              {expanded && (
                <div id={panelId} className="mt-2 ps-2">
                  <StringListEditor
                    compact
                    title={t('subtasks.criteriaTitle')}
                    items={subtask.acceptanceCriteria}
                    onChange={next => actions.updateSubtask(item.ref, index, { acceptanceCriteria: next })}
                    rowLabel={number => t('criteria.rowLabel', { number: number + 1, task: subtask.title })}
                    removeLabel={number => t('criteria.remove', { number: number + 1, task: subtask.title })}
                    addLabel={t('criteria.add')}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!canAdd}
        onClick={() => actions.addSubtask(item.ref, t('subtasks.newTitle'))}
        className="h-10 gap-1.5 px-2 text-primary md:h-8"
      >
        <Plus aria-hidden className="size-3.5" /> {canAdd ? t('subtasks.add') : t('subtasks.full')}
      </Button>
    </div>
  );
};
