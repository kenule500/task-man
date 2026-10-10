import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronRight, Circle, CircleCheck, ExternalLink, Link2, ListChecks, Loader2, MoreHorizontal, Plus, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  AssigneeStack, StatusBadge, TaskKey, describeEpicProgress, epicProgress, itemsOfEpic,
  type Task,
} from '@/features/tasks';
import { subtaskProgress } from '../lib/grouping';
import { formatSprintRange } from '../lib/sprintStats';
import { TaskTypeIcon } from './TaskRow';

export interface EpicTreeProps {
  epics: Task[];
  /** Tasks of the project (items and subtasks are found among them). */
  tasks: Task[];
  canWrite: boolean;
  /** Ids of the expanded epics and items. */
  expanded: ReadonlySet<string>;
  onToggle: (id: string, open: boolean) => void;
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onAddToEpic?: (epic: Task, title: string) => Promise<unknown>;
  onAddSubtask?: (item: Task, title: string) => Promise<unknown>;
  onLinkExisting?: (epic: Task) => void;
  onRemoveFromEpic?: (item: Task) => void;
}

const byPosition = (a: Task, b: Task) => a.position - b.position;

/** Title that opens the details; stretched over the row so the whole row is clickable with one tab stop. */
const openButtonClass = 'block min-w-0 text-left outline-none [overflow-wrap:anywhere] after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary';
const raisedClass = 'relative z-10';
const tapClass = 'flex size-11 shrink-0 items-center justify-center rounded-lg md:size-8';

interface DiscloseProps {
  expanded: boolean;
  label: string;
  controls: string;
  onChange: (open: boolean) => void;
}

/** Chevron button: Enter / Space toggle, ArrowRight expands, ArrowLeft collapses. */
const Disclose = ({ expanded, label, controls, onChange }: DiscloseProps) => {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' && !expanded) {
      event.preventDefault();
      onChange(true);
    } else if (event.key === 'ArrowLeft' && expanded) {
      event.preventDefault();
      onChange(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => onChange(!expanded)}
      onKeyDown={onKeyDown}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
      className={cn(raisedClass, tapClass, '-my-1 text-slate-500 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-primary')}
    >
      <ChevronRight aria-hidden className={cn('size-4 transition-transform motion-reduce:transition-none', expanded && 'rotate-90')} />
    </button>
  );
};

const DoneToggle = ({ task, canWrite, onToggle }: { task: Task; canWrite: boolean; onToggle: EpicTreeProps['onToggleDone'] }) => {
  const done = task.status === 'completed';
  return (
    <button
      type="button"
      aria-pressed={done}
      disabled={!canWrite}
      onClick={() => onToggle(task, !done)}
      aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      className={cn(
        raisedClass, tapClass, 'rounded-full text-slate-500 transition-colors hover:text-emerald-700',
        'focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:hover:text-slate-500',
        done && 'text-emerald-600',
      )}
    >
      {done ? <CircleCheck className="size-5" aria-hidden /> : <Circle className="size-5" aria-hidden />}
    </button>
  );
};

interface InlineAddProps {
  /** Accessible name and placeholder of the field. */
  label: string;
  /** Accessible name of the submit button. */
  submitLabel: string;
  onAdd: (title: string) => Promise<unknown>;
}

/** One-line input that creates a child on Enter; keeps the text when the request fails. */
const InlineAdd = ({ label, submitLabel, onAdd }: InlineAddProps) => {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onAdd(trimmed);
      setTitle('');
    } catch {
      // The caller reports the failure; keep the text so nothing is lost
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
      <Input
        value={title}
        onChange={event => setTitle(event.target.value)}
        placeholder={label}
        aria-label={label}
        maxLength={140}
        className="h-11 min-w-0 flex-1 rounded-lg border-slate-200 bg-white text-base shadow-none sm:h-9 sm:text-sm"
      />
      <Button
        type="submit"
        disabled={busy || !title.trim()}
        aria-label={submitLabel}
        className="h-11 shrink-0 rounded-lg bg-primary px-3 text-white hover:bg-primary-hover sm:h-9"
      >
        {busy ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
      </Button>
    </form>
  );
};

const ITEM_CLASS = 'min-h-10 text-slate-700 md:min-h-0';

/** Epic -> item -> subtask hierarchy as nested lists with disclosure buttons; every row opens its details. */
const EpicTree = ({
  epics, tasks, canWrite, expanded, onToggle, onOpen, onToggleDone, onAddToEpic, onAddSubtask, onLinkExisting, onRemoveFromEpic,
}: EpicTreeProps) => {
  const subtasksOf = (id: string) => tasks.filter(task => task.parent === id).sort(byPosition);

  const renderSubtask = (subtask: Task) => {
    const done = subtask.status === 'completed';
    return (
      <li key={subtask._id} className="relative flex items-start gap-1 rounded-lg py-0.5 pr-2 hover:bg-slate-100/70">
        <DoneToggle task={subtask} canWrite={canWrite} onToggle={onToggleDone} />
        <div className="min-w-0 flex-1 pt-3 md:pt-1.5">
          <button
            type="button"
            title={subtask.title}
            onClick={() => onOpen(subtask)}
            className={cn(openButtonClass, 'line-clamp-2 text-sm font-medium text-slate-800', done && 'text-slate-500 line-through')}
          >
            {subtask.title}
          </button>
        </div>
        <StatusBadge status={subtask.status} className="mt-3 shrink-0 px-2 py-0.5 md:mt-1.5" />
      </li>
    );
  };

  const renderItem = (item: Task) => {
    const subtasks = subtasksOf(item._id);
    const progress = subtaskProgress(subtasks);
    const done = item.status === 'completed';
    const canExpand = subtasks.length > 0 || (canWrite && Boolean(onAddSubtask));
    const open = canExpand && expanded.has(item._id);
    const panelId = `epic-tree-${item._id}`;

    return (
      <li key={item._id} className="border-t border-slate-100">
        <div className="relative flex items-start gap-1 py-2 pl-5 pr-2 hover:bg-slate-50 sm:gap-2 sm:pl-9 sm:pr-4">
          {canExpand ? (
            <Disclose expanded={open} label={`subtasks of ${item.title}`} controls={panelId} onChange={next => onToggle(item._id, next)} />
          ) : (
            <span aria-hidden className="hidden size-8 shrink-0 md:block" />
          )}
          <TaskTypeIcon type={item.type} className="mt-1.5 md:mt-0.5" />
          <div className="min-w-0 flex-1 pt-2 md:pt-0.5">
            <div className="flex min-w-0 items-baseline gap-2">
              <TaskKey task={item} />
              <button
                type="button"
                title={item.title}
                onClick={() => onOpen(item)}
                className={cn(openButtonClass, 'line-clamp-2 text-sm font-semibold text-slate-900', done && 'text-slate-500 line-through')}
              >
                {item.title}
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge status={item.status} className="px-2 py-0.5" />
              {typeof item.storyPoints === 'number' && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                  {item.storyPoints}<span aria-hidden> pts</span>
                  <span className="sr-only"> story points</span>
                </span>
              )}
              {progress.total > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-slate-600">
                  <ListChecks aria-hidden className="size-3.5" />
                  {progress.done}/{progress.total}
                  <span className="sr-only"> subtasks done</span>
                </span>
              )}
              <AssigneeStack users={item.assignees} />
            </div>
          </div>
          <div className={cn(raisedClass, 'shrink-0')}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={(
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${item.title}`}
                    className="size-11 text-slate-500 hover:bg-slate-200 md:size-8"
                  />
                )}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 md:w-48">
                <DropdownMenuItem onClick={() => onOpen(item)} className={ITEM_CLASS}>
                  <ExternalLink /> Open
                </DropdownMenuItem>
                {canWrite && onRemoveFromEpic && (
                  <DropdownMenuItem onClick={() => onRemoveFromEpic(item)} className={ITEM_CLASS}>
                    <Unlink /> Remove from epic
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {open && (
          <div id={panelId} className="border-t border-slate-100 bg-slate-50/70 py-1 pl-8 pr-2 sm:pl-16 sm:pr-4">
            {subtasks.length > 0 && <ul aria-label={`Subtasks of ${item.title}`}>{subtasks.map(renderSubtask)}</ul>}
            {canWrite && onAddSubtask && (
              <div className="flex py-1.5">
                <InlineAdd
                  label={`Add a subtask to ${item.title}…`}
                  submitLabel={`Add subtask to ${item.title}`}
                  onAdd={title => onAddSubtask(item, title)}
                />
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <ul aria-label="Epics">
      {epics.map(epic => {
        const progress = epicProgress(epic, tasks);
        const summary = describeEpicProgress(progress);
        const complete = progress.items > 0 && progress.percent === 100;
        const items = itemsOfEpic(tasks, epic._id).sort(byPosition);
        const open = expanded.has(epic._id);
        const panelId = `epic-tree-${epic._id}`;
        const hasControls = canWrite && Boolean(onAddToEpic || onLinkExisting);

        return (
          <li key={epic._id} className="border-b border-slate-100 last:border-b-0">
            <div className="relative px-2 py-3 hover:bg-slate-50 sm:px-4">
              <div className="flex items-start gap-1 sm:gap-2">
                <Disclose expanded={open} label={`items of ${epic.title}`} controls={panelId} onChange={next => onToggle(epic._id, next)} />
                <TaskTypeIcon type="epic" className="mt-1.5 md:mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 pt-2 md:pt-0.5">
                  <TaskKey task={epic} />
                  <button
                    type="button"
                    title={epic.title}
                    onClick={() => onOpen(epic)}
                    className={cn(openButtonClass, 'line-clamp-2 flex-1 text-sm font-semibold text-slate-900')}
                  >
                    {epic.title}
                  </button>
                </div>
                <StatusBadge status={epic.status} className="mt-2 shrink-0 px-2 py-0.5 md:mt-0.5" />
              </div>
              <div className="mt-2 flex items-center gap-3 pl-9 sm:pl-12">
                <div
                  role="progressbar"
                  aria-label={`${epic.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.percent}
                  aria-valuetext={summary}
                  className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className={cn('h-full rounded-full', complete ? 'bg-emerald-500' : 'bg-fuchsia-600')}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{progress.percent}%</span>
              </div>
              <p className="mt-1.5 pl-9 text-xs text-slate-600 sm:pl-12">
                {progress.items === 0 ? 'No items yet' : summary}
                <span aria-hidden className="mx-1.5 text-slate-400">|</span>
                <span className="tabular-nums">{formatSprintRange({ startDate: progress.start, endDate: progress.end })}</span>
              </p>
            </div>

            {open && (
              <div id={panelId} className="bg-white">
                {items.length > 0 && <ul aria-label={`Items of ${epic.title}`}>{items.map(renderItem)}</ul>}
                {items.length === 0 && (
                  <p className="border-t border-slate-100 py-3 pl-9 pr-4 text-sm text-slate-600 sm:pl-16">
                    {canWrite ? 'No items yet. Add a task below or link an existing one.' : 'No items in this epic yet.'}
                  </p>
                )}
                {hasControls && (
                  <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2 sm:flex-row sm:items-center sm:pl-16 sm:pr-4">
                    {onAddToEpic && (
                      <InlineAdd
                        label={`Add a task to ${epic.title}…`}
                        submitLabel={`Add task to ${epic.title}`}
                        onAdd={title => onAddToEpic(epic, title)}
                      />
                    )}
                    {onLinkExisting && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onLinkExisting(epic)}
                        className="h-11 shrink-0 gap-1.5 rounded-lg border-slate-300 text-sm font-medium text-slate-700 shadow-none hover:bg-slate-100 sm:h-9"
                      >
                        <Link2 aria-hidden className="size-4" />
                        <span>Link existing task…<span className="sr-only"> to {epic.title}</span></span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default EpicTree;
