import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Zap } from 'lucide-react';
import { EmptyState } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AssigneeStack, OptionSelect, StatusBadge, TaskKey, type Task } from '@/features/tasks';
import { TaskTypeIcon } from './TaskRow';
import EpicTree from './EpicTree';
import LinkTaskDialog from './LinkTaskDialog';
import QuickAdd from './QuickAdd';

interface EpicsPanelProps {
  /** Epics of the project, in the order to show. */
  epics: Task[];
  /** Tasks of the project (the epics' items and their subtasks are found among them). */
  tasks: Task[];
  canWrite: boolean;
  /** Opens a task (epic, item or subtask) in its details. */
  onOpen: (task: Task) => void;
  /** Quick-adds an epic by title; the quick-add is hidden without it. */
  onAdd?: (title: string) => Promise<unknown>;
  /** Remembers which rows are expanded for this project (sessionStorage); not remembered without it. */
  storageKey?: string;
  /** Marks a subtask done / not done. */
  onToggleDone?: (task: Task, done: boolean) => void;
  /** Creates a story in the epic. */
  onAddToEpic?: (epic: Task, title: string) => Promise<unknown>;
  /** Creates a subtask of the item. */
  onAddSubtask?: (item: Task, title: string) => Promise<unknown>;
  /** Puts the tasks in the epic; rejects with a message the dialog shows. */
  onLinkTasks?: (epic: Task, taskIds: string[]) => Promise<unknown>;
  onRemoveFromEpic?: (item: Task) => void;
  onMoveToEpic?: (task: Task, epicId: string) => void;
}

const STORAGE_PREFIX = 'taskman.epics.expanded.';
const UNASSIGNED_ID = 'epics-not-in-an-epic';
const MOVE_PLACEHOLDER = '';

const readExpanded = (storageKey?: string): Set<string> => {
  if (!storageKey) return new Set();
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_PREFIX + storageKey) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
};

const byPosition = (a: Task, b: Task) => a.position - b.position;
const noop = () => undefined;

/** Epics of a project as an expandable hierarchy (epic -> item -> subtask) that can be organised in place. */
const EpicsPanel = ({
  epics, tasks, canWrite, onOpen, onAdd, storageKey, onToggleDone = noop,
  onAddToEpic, onAddSubtask, onLinkTasks, onRemoveFromEpic, onMoveToEpic,
}: EpicsPanelProps) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => readExpanded(storageKey));
  const [linking, setLinking] = useState<Task | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.sessionStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify([...expanded]));
    } catch {
      // Storage unavailable (private mode): the state just lives in memory
    }
  }, [expanded, storageKey]);

  const toggle = useCallback((id: string, open: boolean) => {
    setExpanded(current => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const topLevel = useMemo(() => tasks.filter(task => !task.parent && task.type !== 'epic').sort(byPosition), [tasks]);
  const unassigned = useMemo(() => topLevel.filter(task => !task.epic), [topLevel]);
  const epicTitles = useMemo(() => new Map(epics.map(epic => [epic._id, epic.title])), [epics]);
  const expandable = useMemo(() => {
    const parents = new Set(tasks.filter(task => task.parent).map(task => task.parent as string));
    return [...epics.map(epic => epic._id), ...topLevel.filter(task => task.epic && (canWrite || parents.has(task._id))).map(task => task._id)];
  }, [epics, topLevel, tasks, canWrite]);

  const unassignedOpen = expanded.has(UNASSIGNED_ID);
  const moveOptions = useMemo(
    () => [{ value: MOVE_PLACEHOLDER, label: 'Move to epic' }, ...epics.map(epic => ({ value: epic._id, label: epic.title }))],
    [epics],
  );
  const canMove = canWrite && Boolean(onMoveToEpic) && epics.length > 0;

  return (
    <div>
      {canWrite && onAdd && <QuickAdd label="Add an epic…" onAdd={onAdd} />}
      {epics.length === 0 ? (
        <EmptyState
          className="py-10"
          icon={<Zap />}
          title="No epics yet"
          description={canWrite
            ? 'An epic groups stories, tasks and bugs that belong together, across sprints. Add one above, then add or link tasks to it.'
            : 'Epics group stories, tasks and bugs that belong together, across sprints.'}
        />
      ) : (
        <>
          <div className="flex items-center justify-end gap-1 border-b border-slate-100 px-2 py-1 sm:px-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setExpanded(current => new Set([...current, ...expandable]))}
              className="h-11 px-3 text-sm text-slate-700 md:h-8"
            >
              Expand all
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setExpanded(new Set())}
              className="h-11 px-3 text-sm text-slate-700 md:h-8"
            >
              Collapse all
            </Button>
          </div>

          <EpicTree
            epics={epics}
            tasks={tasks}
            canWrite={canWrite}
            expanded={expanded}
            onToggle={toggle}
            onOpen={onOpen}
            onToggleDone={onToggleDone}
            onAddToEpic={onAddToEpic}
            onAddSubtask={onAddSubtask}
            onLinkExisting={onLinkTasks ? setLinking : undefined}
            onRemoveFromEpic={onRemoveFromEpic}
          />

          {unassigned.length > 0 && (
            <section aria-labelledby="epics-unassigned-title" className="border-t border-slate-200">
              <h3 id="epics-unassigned-title" className="text-sm font-semibold text-slate-900">
                <button
                  type="button"
                  onClick={() => toggle(UNASSIGNED_ID, !unassignedOpen)}
                  aria-expanded={unassignedOpen}
                  aria-controls={UNASSIGNED_ID}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-4 md:min-h-10"
                >
                  <ChevronRight aria-hidden className={cn('size-4 text-slate-500 transition-transform motion-reduce:transition-none', unassignedOpen && 'rotate-90')} />
                  Not in an epic
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-medium tabular-nums text-slate-600">{unassigned.length}</span>
                </button>
              </h3>
              {unassignedOpen && (
                <ul id={UNASSIGNED_ID} aria-label="Tasks not in an epic">
                  {unassigned.map(task => (
                    <li key={task._id} className="relative flex flex-wrap items-start gap-x-2 gap-y-2 border-t border-slate-100 px-3 py-2.5 hover:bg-slate-50 sm:px-4">
                      <TaskTypeIcon type={task.type} className="mt-0.5" />
                      <div className="min-w-0 flex-1 basis-48">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <TaskKey task={task} />
                          <button
                            type="button"
                            title={task.title}
                            onClick={() => onOpen(task)}
                            className="block min-w-0 text-left text-sm font-semibold text-slate-900 outline-none [overflow-wrap:anywhere] line-clamp-2 after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary"
                          >
                            {task.title}
                          </button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <StatusBadge status={task.status} className="px-2 py-0.5" />
                          {typeof task.storyPoints === 'number' && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                              {task.storyPoints}<span aria-hidden> pts</span>
                              <span className="sr-only"> story points</span>
                            </span>
                          )}
                          <AssigneeStack users={task.assignees} />
                        </div>
                      </div>
                      {canMove && (
                        <div className="relative z-10 shrink-0">
                          <OptionSelect
                            value={MOVE_PLACEHOLDER}
                            options={moveOptions}
                            onChange={epicId => onMoveToEpic?.(task, epicId)}
                            aria-label={`Move "${task.title}" to an epic`}
                            className="h-11 w-40 sm:w-48 md:h-8"
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {linking && onLinkTasks && (
        <LinkTaskDialog
          open
          onOpenChange={open => !open && setLinking(null)}
          epic={linking}
          candidates={topLevel.filter(task => task.epic !== linking._id)}
          epicTitles={epicTitles}
          onConfirm={ids => onLinkTasks(linking, ids)}
        />
      )}
    </div>
  );
};

export default EpicsPanel;
