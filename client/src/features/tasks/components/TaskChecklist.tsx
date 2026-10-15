import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, ListChecks, Plus, Trash2 } from 'lucide-react';
import { SectionHeader, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '../api';
import {
  MAX_CHECKLIST_ITEMS, MAX_CHECKLIST_TEXT, addChecklistItem, canAddChecklistItem, checklistProgress, cleanChecklistText,
  moveChecklistItem, removeChecklistItem, renameChecklistItem, toggleChecklistItem,
} from '../lib/checklist';
import type { ChecklistItem } from '../types';

export interface TaskChecklistProps {
  items: ChecklistItem[];
  /** Holds `tasks:write`: tick, add, rename, reorder and delete. Read-only otherwise. */
  canWrite: boolean;
  /** Receives the whole new list after every change. */
  onChange: (items: ChecklistItem[]) => Promise<unknown> | void;
}

const ICON_BUTTON = 'size-9 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 sm:size-7';

/** Progress "3/5" with a thin bar. */
const Progress = ({ items }: { items: ChecklistItem[] }) => {
  const { done, total } = checklistProgress(items);
  if (total === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500 tabular-nums">
      <span aria-hidden className="h-1.5 w-8 overflow-hidden rounded-full bg-slate-200">
        <span
          className={cn('block h-full rounded-full', done === total ? 'bg-success-dot' : 'bg-primary')}
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </span>
      <span aria-hidden>{done}/{total}</span>
      <span className="sr-only">{done} of {total} checklist items done</span>
    </span>
  );
};

/** Checklist of a task: progress, tick, click-to-rename, move up/down, delete and an "add item" input. */
const TaskChecklist = ({ items, canWrite, onChange }: TaskChecklistProps) => {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  // Button to focus once a reorder has been applied (the moved row re-renders in a new place)
  const focusAfterMove = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

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

  const apply = async (next: ChecklistItem[], failure: string) => {
    try {
      await onChange(next);
    } catch (err) {
      toast.error(getApiErrorMessage(err, failure));
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const next = addChecklistItem(items, text);
    if (next.length === items.length) return;
    setText('');
    void apply(next, 'Could not add the item.');
  };

  const commitRename = () => {
    if (!editing) return;
    const { id, draft } = editing;
    setEditing(null);
    const clean = cleanChecklistText(draft);
    if (clean && clean !== items.find(item => item._id === id)?.text) {
      void apply(renameChecklistItem(items, id, clean), 'Could not rename the item.');
    }
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
    void apply(moveChecklistItem(items, id, direction), 'Could not move the item.');
  };

  const full = !canAddChecklistItem(items);

  return (
    <section aria-label="Checklist">
      <SectionHeader
        title="Checklist"
        icon={<ListChecks className="size-4 text-slate-500" aria-hidden />}
        action={<Progress items={items} />}
        className="mb-2"
      />

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No checklist items yet.</p>
      ) : (
        <ul ref={listRef} className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((item, index) => (
            <li key={item._id} data-item={item._id} className="flex min-h-11 items-start gap-2.5 px-3 py-1.5">
              <Checkbox
                checked={item.done}
                disabled={!canWrite}
                onCheckedChange={checked => { void apply(toggleChecklistItem(items, item._id, checked), 'Could not save your change.'); }}
                aria-label={item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
                className="mt-3 sm:mt-2.5"
              />
              <div className="min-w-0 flex-1">
                {editing?.id === item._id ? (
                  <Input
                    aria-label={`Rename checklist item "${item.text}"`}
                    value={editing.draft}
                    onChange={event => setEditing({ id: item._id, draft: event.target.value })}
                    onBlur={commitRename}
                    onKeyDown={onEditKeyDown}
                    maxLength={MAX_CHECKLIST_TEXT}
                    autoFocus
                    className="h-10 rounded-lg border border-slate-300 bg-white text-base text-slate-900 shadow-none focus-visible:border-primary focus-visible:ring-0 sm:h-8 sm:text-sm"
                  />
                ) : canWrite ? (
                  <button
                    type="button"
                    title="Click to rename"
                    onClick={() => setEditing({ id: item._id, draft: item.text })}
                    className={cn(
                      'block min-h-10 w-full rounded px-1 py-2 text-left text-sm [overflow-wrap:anywhere] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary sm:min-h-8 sm:py-1.5',
                      item.done ? 'text-slate-500 line-through' : 'text-slate-900',
                    )}
                  >
                    {item.text}
                  </button>
                ) : (
                  <span className={cn('block px-1 py-2 text-sm [overflow-wrap:anywhere]', item.done ? 'text-slate-500 line-through' : 'text-slate-900')}>
                    {item.text}
                  </span>
                )}
              </div>
              {canWrite && (
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-move="up"
                    aria-label={`Move "${item.text}" up`}
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
                    aria-label={`Move "${item.text}" down`}
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
                    aria-label={`Delete checklist item "${item.text}"`}
                    onClick={() => { void apply(removeChecklistItem(items, item._id), 'Could not delete the item.'); }}
                    className={cn(ICON_BUTTON, 'hover:bg-danger-bg hover:text-danger-fg')}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        full ? (
          <p className="mt-3 text-xs text-slate-500">A checklist can have at most {MAX_CHECKLIST_ITEMS} items.</p>
        ) : (
          <form onSubmit={add} className="mt-3 flex items-center gap-2">
            <Input
              aria-label="Add checklist item"
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="Add an item and press Enter"
              maxLength={MAX_CHECKLIST_TEXT}
              className="h-11 rounded-lg border border-slate-300 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-0 sm:h-9 sm:text-sm"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!cleanChecklistText(text)}
              className="h-11 shrink-0 gap-1.5 border-slate-300 text-slate-700 sm:h-9"
            >
              <Plus className="size-4" aria-hidden /> Add
            </Button>
          </form>
        )
      )}
    </section>
  );
};

export default TaskChecklist;
