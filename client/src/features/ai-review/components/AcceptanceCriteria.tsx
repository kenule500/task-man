import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SectionHeader, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TaskCriterion } from '@/features/tasks/types';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/utils/api';
import {
  MAX_CRITERIA, MAX_CRITERION_TEXT, addCriterion, canAddCriterion, cleanCriterionText, moveCriterion, removeCriterion, renameCriterion,
} from '../lib/criteria';

export interface AcceptanceCriteriaProps {
  items: TaskCriterion[];
  /** Holds `tasks:write`: add, rename, reorder and delete. Read-only otherwise. */
  canWrite: boolean;
  /** Receives the whole new list after every change. */
  onChange: (items: TaskCriterion[]) => Promise<unknown> | void;
}

const ICON_BUTTON = 'size-9 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 sm:size-7';

/** Acceptance criteria of a task: what "done" means, in order. The AI code review checks the pull request against each one. */
const AcceptanceCriteria = ({ items, canWrite, onChange }: AcceptanceCriteriaProps) => {
  const { t } = useTranslation('ai');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  // Button to focus once a reorder has been applied (the moved row re-renders in a new place)
  const focusAfterMove = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!focusAfterMove.current) return;
    const [id, direction] = focusAfterMove.current.split(':');
    focusAfterMove.current = null;
    const row = listRef.current?.querySelector(`[data-item="${id}"]`);
    const preferred = row?.querySelector<HTMLButtonElement>(`[data-move="${direction}"]`);
    const other = row?.querySelector<HTMLButtonElement>(`[data-move="${direction === 'up' ? 'down' : 'up'}"]`);
    (preferred && !preferred.disabled ? preferred : other)?.focus();
  }, [items]);

  if (items.length === 0 && !canWrite) return null;

  const apply = async (next: TaskCriterion[]) => {
    try {
      await onChange(next);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('criteria.saveError')));
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const next = addCriterion(items, text);
    if (next.length === items.length) return;
    setText('');
    void apply(next);
  };

  const commitRename = () => {
    if (!editing) return;
    const { id, draft } = editing;
    setEditing(null);
    const clean = cleanCriterionText(draft);
    if (clean && clean !== items.find(item => item._id === id)?.text) void apply(renameCriterion(items, id, clean));
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      setEditing(null);
    }
  };

  const move = (id: string, direction: -1 | 1) => {
    focusAfterMove.current = `${id}:${direction === -1 ? 'up' : 'down'}`;
    void apply(moveCriterion(items, id, direction));
  };

  return (
    <section aria-label={t('criteria.title')}>
      <SectionHeader
        title={t('criteria.title')}
        icon={<ClipboardCheck className="size-4 text-slate-500" aria-hidden />}
        count={items.length > 0 ? items.length : undefined}
        className="mb-2"
      />

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{t('criteria.none')}</p>
      ) : (
        <ol ref={listRef} className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((item, index) => (
            <li key={item._id} data-item={item._id} className="flex min-h-11 items-start gap-2 px-3 py-1.5">
              <span className="mt-2.5 w-5 shrink-0 text-end text-xs tabular-nums text-slate-500 sm:mt-2" aria-hidden>{index + 1}.</span>
              <div className="min-w-0 flex-1">
                {editing?.id === item._id ? (
                  <Input
                    aria-label={t('criteria.editLabel', { text: item.text })}
                    value={editing.draft}
                    onChange={event => setEditing({ id: item._id, draft: event.target.value })}
                    onBlur={commitRename}
                    onKeyDown={onEditKeyDown}
                    maxLength={MAX_CRITERION_TEXT}
                    autoFocus
                    className="h-10 rounded-lg border border-slate-300 bg-white text-base text-slate-900 shadow-none focus-visible:border-primary focus-visible:ring-0 sm:h-8 sm:text-sm"
                  />
                ) : canWrite ? (
                  <button
                    type="button"
                    title={t('criteria.clickToEdit')}
                    onClick={() => setEditing({ id: item._id, draft: item.text })}
                    className="block min-h-10 w-full rounded px-1 py-2 text-start text-sm text-slate-900 [overflow-wrap:anywhere] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary sm:min-h-8 sm:py-1.5"
                  >
                    {item.text}
                  </button>
                ) : (
                  <span className="block px-1 py-2 text-sm text-slate-900 [overflow-wrap:anywhere]">{item.text}</span>
                )}
              </div>
              {canWrite && (
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-move="up"
                    aria-label={t('criteria.moveUp', { text: item.text })}
                    disabled={index === 0}
                    onClick={() => move(item._id, -1)}
                    className={ICON_BUTTON}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-move="down"
                    aria-label={t('criteria.moveDown', { text: item.text })}
                    disabled={index === items.length - 1}
                    onClick={() => move(item._id, 1)}
                    className={ICON_BUTTON}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('criteria.delete', { text: item.text })}
                    onClick={() => { void apply(removeCriterion(items, item._id)); }}
                    className={cn(ICON_BUTTON, 'hover:bg-danger-bg hover:text-danger-fg')}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {canWrite && (
        canAddCriterion(items) ? (
          <form onSubmit={add} className="mt-3 flex items-center gap-2">
            <Input
              aria-label={t('criteria.addLabel')}
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder={t('criteria.addPlaceholder')}
              maxLength={MAX_CRITERION_TEXT}
              className="h-11 rounded-lg border border-slate-300 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-0 sm:h-9 sm:text-sm"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!cleanCriterionText(text)}
              className="h-11 shrink-0 gap-1.5 border-slate-300 text-slate-700 sm:h-9"
            >
              <Plus className="size-4" aria-hidden /> {t('criteria.add')}
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-xs text-slate-500">{t('criteria.full', { max: MAX_CRITERIA })}</p>
        )
      )}
    </section>
  );
};

export default AcceptanceCriteria;
