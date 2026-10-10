import {
  useEffect, useId, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent, type TouchEvent,
} from 'react';
import { ArrowRight, Check, Ellipsis, MessageSquare, Paperclip, Plus, RotateCcw, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Link, useInRouterContext, useParams } from 'react-router-dom';
import { StageDot } from '@/features/workflow/components/StageBadges';
import { useWorkflow } from '@/features/workflow/hooks/useWorkflow';
import { STAGE_COLOR_META, groupByStage, quickMoveFor, resolveStage, stagePatch, type QuickMove } from '@/features/workflow/lib/stages';
import type { WorkflowStage } from '@/features/workflow/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChecklistBadge, DependencyCount, DueDate, PriorityIndicator, RelationCount, RepeatBadge, SubtaskProgress, TaskTypeIcon,
} from '../components/TaskBadges';
import BoardQuickFilters from '../components/BoardQuickFilters';
import BoardSwimlanes from '../components/BoardSwimlanes';
import MoveTaskSheet from '../components/MoveTaskSheet';
import TaskActionsMenu from '../components/TaskActionsMenu';
import { AssigneeStack, LabelList } from '../components/TaskChips';
import TaskKey from '../components/TaskKey';
import WipLimitsDialog from '../components/WipLimitsDialog';
import { useBoardSettings, useIsDesktop, type BoardUrlState } from '../hooks/useBoardSettings';
import { applyQuickFilters, type QuickFilterKey } from '../lib/boardQuickFilters';
import { stepColumn, swipeStep } from '../lib/columnSwipe';
import { getDropPosition, positionBetween, withoutEpics } from '../lib/filters';
import { BOARD_PAGE_SIZE, pageCount, paginate } from '../lib/pagination';
import { ALL_LANE_ID, groupIntoSwimlanes, laneIdOf, type Swimlane, type SwimlaneGroup } from '../lib/swimlanes';
import { isOverWip, wipCountLabel } from '../lib/wip';
import type { Task } from '../types';
import ProjectChip from '@/features/projects/components/ProjectChip';
import type { TaskViewProps } from './types';

interface DropTarget {
  laneId: string;
  /** Stage key of the column */
  status: string;
  /** Insertion index within the column (as currently rendered) */
  index: number;
}

/** Glyph of the one-tap phone action. */
const QUICK_ICONS: Record<QuickMove['verb'], LucideIcon> = {
  Start: ArrowRight, Next: ArrowRight, Done: Check, Reopen: RotateCcw,
};

const LONG_PRESS_MS = 500;
/** Finger travel (px) that turns a press into a scroll or drag. */
const LONG_PRESS_SLOP = 8;
/** How long the "Moved to ..." chip stays. */
const HINT_MS = 6000;
const SLIDE_MS = 150;

const pageKey = (laneId: string, status: string) => `${laneId}::${status}`;

export interface BoardViewProps extends TaskViewProps {
  /**
   * Board UI state owned by the page (kept in the URL: ?col, ?qf, ?group). Any part left out
   * falls back to local state, so the board also works on its own.
   */
  controls?: Partial<BoardUrlState>;
  /** Every task of the workspace: dependencies and WIP counts must not depend on the page filters. Defaults to `tasks`. */
  allTasks?: Task[];
  /** Enables "My tasks"; without a user that quick filter is hidden. */
  currentUserId?: string;
  /** Workspace whose board settings (WIP limits) are loaded. */
  workspaceSlug?: string;
  /** Holds `settings:manage`: shows "Set WIP limits" in the column menu. */
  canManageBoard?: boolean;
}

/**
 * Kanban board: Pending > In Progress > Completed. Phones show one column at a time (segmented switcher,
 * swipe, ?col= in the URL); from md the three columns sit side by side with drag & drop, optionally split into swimlanes.
 */
const BoardView = ({
  tasks: shownTasks, onUpdate, onEdit, onDelete, onCreate, onOpen, canWrite = true, canDelete = true,
  controls, allTasks: everyTask, currentUserId, workspaceSlug, canManageBoard = false,
}: BoardViewProps) => {
  const isDesktop = useIsDesktop();
  // Columns are the workspace's workflow stages (the three plain statuses until the workflow is loaded)
  const { stages, loaded: workflowLoaded } = useWorkflow(workspaceSlug);
  const stageOf = (task: Task) => resolveStage(task, stages);
  // Epics are containers: the board shows their items (lanes can group by epic), never the epics themselves
  const incomingTasks = useMemo(() => withoutEpics(shownTasks), [shownTasks]);
  const allTasks = useMemo(() => (everyTask ? withoutEpics(everyTask) : undefined), [everyTask]);

  // Board UI state: the page's (URL backed) when given, local otherwise
  const [localColumn, setLocalColumn] = useState<string>('');
  const [localQuickFilters, setLocalQuickFilters] = useState<QuickFilterKey[]>([]);
  const [localGroupBy, setLocalGroupBy] = useState<SwimlaneGroup>('none');
  const requestedColumn = controls?.column ?? localColumn;
  const activeColumn = stages.find(stage => stage.key === requestedColumn)?.key ?? stages[0].key;
  const setActiveColumn = controls?.setColumn ?? setLocalColumn;
  const quickFilters = controls?.quickFilters ?? localQuickFilters;
  const setQuickFilters = controls?.setQuickFilters ?? setLocalQuickFilters;
  const groupBy = controls?.groupBy ?? localGroupBy;
  const setGroupBy = controls?.setGroupBy ?? setLocalGroupBy;
  const laneMode = groupBy !== 'none' && isDesktop;

  const tasks = useMemo(
    () => applyQuickFilters(incomingTasks, quickFilters, { currentUserId, allTasks: allTasks ?? incomingTasks }),
    [incomingTasks, quickFilters, currentUserId, allTasks],
  );
  const columns = useMemo(() => groupByStage(tasks, stages), [tasks, stages]);
  // Direct subtasks per parent (for "Duplicate" and the progress badge), and how many of them are done
  const { subtaskCounts, subtasksDone } = useMemo(() => {
    const counts = new Map<string, number>();
    const done = new Map<string, number>();
    for (const item of everyTask ?? shownTasks) {
      if (!item.parent) continue;
      counts.set(item.parent, (counts.get(item.parent) ?? 0) + 1);
      if (item.status === 'completed') done.set(item.parent, (done.get(item.parent) ?? 0) + 1);
    }
    return { subtaskCounts: counts, subtasksDone: done };
  }, [everyTask, shownTasks]);
  const lanes = useMemo<Swimlane[]>(
    () => (laneMode ? groupIntoSwimlanes(tasks, groupBy, everyTask ?? shownTasks) : [{ id: ALL_LANE_ID, label: 'All tasks', tasks }]),
    [laneMode, groupBy, tasks, everyTask, shownTasks],
  );
  const laneColumns = useMemo(
    () => new Map(lanes.map(lane => [lane.id, laneMode ? groupByStage(lane.tasks, stages) : columns])),
    [lanes, laneMode, columns, stages],
  );

  // WIP is about the whole column, whatever the page filters hide. Stage limits come with the workflow;
  // until it is loaded the old per-status board limits apply.
  const { limits, saveLimits } = useBoardSettings(workflowLoaded ? undefined : workspaceSlug);
  const wipCounts = useMemo(() => {
    const all = groupByStage(allTasks ?? incomingTasks, stages);
    return Object.fromEntries(Object.entries(all).map(([key, list]) => [key, list.length])) as Record<string, number>;
  }, [allTasks, incomingTasks, stages]);
  const limitOf = (stage: WorkflowStage): number | null =>
    workflowLoaded ? (stage.wipLimit > 0 ? stage.wipLimit : null) : limits[stage.group];
  const [wipDialog, setWipDialog] = useState<WorkflowStage['group'] | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingLane, setDraggingLane] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Per-cell pagination; resets whenever the set of tasks changes (filters, create, delete), not on moves.
  const taskSignature = useMemo(() => tasks.map(task => task._id).sort().join('|'), [tasks]);
  const [pageState, setPageState] = useState<{ signature: string; pages: Record<string, number> }>({ signature: taskSignature, pages: {} });
  const pages = pageState.signature === taskSignature ? pageState.pages : {};
  const pendingFocus = useRef<string | null>(null);

  // Mobile move sheet + "Moved to" announcement / hint chip
  const [sheetTaskId, setSheetTaskId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [movedToKey, setMovedTo] = useState<string | null>(null);
  const movedTo = stages.find(stage => stage.key === movedToKey) ?? null;
  const announceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const announceMove = (stage: WorkflowStage) => {
    clearTimeout(announceTimer.current);
    setMovedTo(stage.key);
    announceTimer.current = setTimeout(() => setMovedTo(null), HINT_MS);
  };
  useEffect(() => () => clearTimeout(announceTimer.current), []);

  const showMore = (laneId: string, status: string, cell: Task[], all = false) => {
    const current = pages[pageKey(laneId, status)] ?? 1;
    pendingFocus.current = cell[paginate(cell, current).shown]?._id ?? null;
    const next = all ? pageCount(cell.length) : current + 1;
    setPageState({ signature: taskSignature, pages: { ...pages, [pageKey(laneId, status)]: next } });
  };

  const resetDrag = () => {
    setDraggingId(null);
    setDraggingLane(null);
    setDropTarget(null);
  };

  const handleDrop = (event: DragEvent, laneId: string, stage: WorkflowStage) => {
    event.preventDefault();
    if (!canWrite) return;
    const id = event.dataTransfer.getData('text/plain') || draggingId;
    const task = tasks.find(t => t._id === id);
    const cell = laneColumns.get(laneId)?.[stage.key] ?? [];
    const index = dropTarget?.laneId === laneId && dropTarget.status === stage.key ? dropTarget.index : cell.length;
    resetDrag();
    // A card only moves between the columns of its own lane
    if (!task || laneIdOf(task, laneMode ? groupBy : 'none') !== laneId) return;

    const position = getDropPosition(cell, task._id, index);
    const sameColumn = stageOf(task).key === stage.key;
    if (sameColumn && position === null) return;
    void onUpdate(task._id, { ...stagePatch(stage, workflowLoaded), ...(position !== null && { position }) });
    if (!sameColumn) announceMove(stage);
  };

  const handleMoveToStage = (task: Task, stage: WorkflowStage) => {
    if (!canWrite) return;
    const column = columns[stage.key] ?? [];
    void onUpdate(task._id, { ...stagePatch(stage, workflowLoaded), position: positionBetween(column[column.length - 1]?.position) });
    announceMove(stage);
  };

  const openMoveSheet = (task: Task) => {
    setSheetTaskId(task._id);
    setSheetOpen(true);
  };

  // Phone status switcher
  const idPrefix = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const columnId = (key: string) => `${idPrefix}-column-${key}`;
  const stageKeys = useMemo(() => stages.map(stage => stage.key), [stages]);
  const sheetTask = tasks.find(task => task._id === sheetTaskId) ?? null;

  // After "Show more", focus the first newly shown card.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    boardRef.current?.querySelector<HTMLElement>(`[data-task-id="${id}"] [data-card-title]`)?.focus();
  }, [pageState]);

  // Short slide + fade when the phone column changes (skipped for reduced motion)
  const shownColumn = useRef(activeColumn);
  useEffect(() => {
    const previous = shownColumn.current;
    if (previous === activeColumn) return;
    shownColumn.current = activeColumn;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)')?.matches;
    const section = sectionRefs.current[activeColumn];
    if (isDesktop || reduced || !section || typeof section.animate !== 'function') return;
    const direction = stageKeys.indexOf(activeColumn) > stageKeys.indexOf(previous) ? 1 : -1;
    section.animate(
      [{ opacity: 0, transform: `translateX(${direction * 24}px)` }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: SLIDE_MS, easing: 'ease-out' },
    );
  }, [activeColumn, isDesktop, stageKeys]);

  const handleTabKeyDown = (event: KeyboardEvent, key: string) => {
    const index = stageKeys.indexOf(key);
    const target =
      event.key === 'ArrowRight' ? stageKeys[(index + 1) % stageKeys.length]
        : event.key === 'ArrowLeft' ? stageKeys[(index + stageKeys.length - 1) % stageKeys.length]
          : event.key === 'Home' ? stageKeys[0]
            : event.key === 'End' ? stageKeys[stageKeys.length - 1]
              : null;
    if (!target) return;
    event.preventDefault();
    setActiveColumn(target);
    tabRefs.current[target]?.focus();
  };

  // Swipe left/right (touch only) moves between the columns; mostly vertical movements are scrolls
  const swipeOrigin = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    swipeOrigin.current = isDesktop || event.touches.length !== 1 || !touch ? null : { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (event: TouchEvent) => {
    const origin = swipeOrigin.current;
    const touch = event.changedTouches[0];
    swipeOrigin.current = null;
    if (!origin || !touch) return;
    const step = swipeStep(touch.clientX - origin.x, touch.clientY - origin.y);
    if (step !== 0) setActiveColumn(stepColumn(stageKeys, activeColumn, step));
  };

  const renderHeader = (stage: WorkflowStage, className?: string) => (
    <ColumnHeader
      key={stage.key}
      stage={stage}
      count={(columns[stage.key] ?? []).length}
      wipCount={wipCounts[stage.key] ?? 0}
      limit={limitOf(stage)}
      canAdd={canWrite}
      onAdd={() => onCreate(workflowLoaded ? { status: stage.group, stage: stage.key } : { status: stage.group })}
      canManage={canManageBoard && Boolean(workspaceSlug)}
      workflowLoaded={workflowLoaded}
      onManage={() => setWipDialog(stage.group)}
      className={className}
    />
  );

  const renderColumn = (lane: Swimlane, status: string) => {
    const stage = stages.find(item => item.key === status) ?? stages[0];
    const column = laneColumns.get(lane.id)?.[status] ?? [];
    const { visible, shown, total, hasMore, remaining } = paginate(column, pages[pageKey(lane.id, status)] ?? 1);
    const isTarget = dropTarget?.laneId === lane.id && dropTarget.status === status;
    // Swimlanes: a dragged card may only be dropped in the columns of its own lane
    const accepts = draggingLane === null || draggingLane === lane.id;
    const label = stage.name;

    return (
      <section
        key={`${lane.id}-${status}`}
        id={laneMode ? undefined : columnId(status)}
        ref={laneMode ? undefined : (node => { sectionRefs.current[status] = node; })}
        aria-label={laneMode ? `${label} column in ${lane.label}` : `${label} column`}
        onDragOver={event => {
          if (!accepts) return;
          event.preventDefault();
          if (!isTarget || dropTarget.index !== column.length) setDropTarget({ laneId: lane.id, status, index: column.length });
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null);
        }}
        onDrop={event => handleDrop(event, lane.id, stage)}
        className={cn(
          'flex flex-col rounded-2xl border border-slate-100 bg-slate-50/70 transition-colors',
          // Phones: one column at a time
          !laneMode && status !== activeColumn && 'max-md:hidden',
          isTarget && 'border-primary/30 bg-blue-50/40',
        )}
      >
        {!laneMode && renderHeader(stage)}

        <ol className={cn('flex flex-col gap-2 px-2.5 pb-3 md:gap-2.5 md:px-3', laneMode ? 'min-h-16 pt-3' : 'min-h-32')}>
          {visible.map((task, index) => (
            <li
              key={task._id}
              data-task-id={task._id}
              onDragOver={event => {
                if (!accepts) return;
                event.preventDefault();
                event.stopPropagation();
                const { top, height } = event.currentTarget.getBoundingClientRect();
                const nextIndex = event.clientY > top + height / 2 ? index + 1 : index;
                if (!isTarget || dropTarget.index !== nextIndex) setDropTarget({ laneId: lane.id, status, index: nextIndex });
              }}
            >
              {isTarget && dropTarget.index === index && <DropIndicator />}
              <BoardCard
                task={task}
                subtaskCount={subtaskCounts.get(task._id) ?? 0}
                subtasksDone={subtasksDone.get(task._id) ?? 0}
                canWrite={canWrite}
                canDelete={canDelete}
                canDrag={canWrite && isDesktop}
                dragging={draggingId === task._id}
                onDragStart={event => {
                  event.dataTransfer.setData('text/plain', task._id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDraggingId(task._id);
                  setDraggingLane(lane.id);
                }}
                onDragEnd={resetDrag}
                onEdit={onEdit}
                onDelete={onDelete}
                onOpen={onOpen}
                stages={stages}
                onMoveToStage={handleMoveToStage}
                onOpenMoveSheet={openMoveSheet}
              />
            </li>
          ))}
          {isTarget && dropTarget.index >= visible.length && <DropIndicator />}
          {column.length === 0 && !isTarget && (
            <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-xs text-slate-600">
              {canWrite ? (
                <>
                  <span className="md:hidden">No tasks</span>
                  <span className="max-md:hidden">Drop tasks here</span>
                </>
              ) : 'No tasks'}
            </li>
          )}
        </ol>

        {total > BOARD_PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pb-3 md:px-4">
            <p className="text-xs tabular-nums text-slate-600">Showing {shown} of {total}</p>
            {hasMore && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => showMore(lane.id, status, column)}
                  aria-label={`Show ${Math.min(BOARD_PAGE_SIZE, remaining)} more ${label} tasks`}
                  className="min-h-11 px-3 text-xs font-semibold text-primary md:min-h-8"
                >
                  Show {Math.min(BOARD_PAGE_SIZE, remaining)} more
                </Button>
                {remaining > BOARD_PAGE_SIZE && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => showMore(lane.id, status, column, true)}
                    aria-label={`Show all ${total} ${label} tasks`}
                    className="min-h-11 px-2 text-xs md:min-h-8"
                  >
                    Show all
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div ref={boardRef} className="min-w-0">
      <BoardQuickFilters
        active={quickFilters}
        onChange={setQuickFilters}
        canFilterMine={Boolean(currentUserId)}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        className="mb-2"
      />

      {/* Phones: segmented status switcher, sticky; the board shows the selected column only */}
      {!laneMode && (
        <div
          role="tablist"
          aria-label="Task status"
          data-testid="board-tabs"
          className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 mb-3 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur md:hidden"
        >
          {stages.map(stage => {
            const active = stage.key === activeColumn;
            return (
              <button
                key={stage.key}
                ref={node => { tabRefs.current[stage.key] = node; }}
                type="button"
                role="tab"
                id={`${idPrefix}-tab-${stage.key}`}
                aria-selected={active}
                aria-controls={columnId(stage.key)}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveColumn(stage.key)}
                onKeyDown={event => handleTabKeyDown(event, stage.key)}
                className={cn(
                  'flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors',
                  stages.length > 3 && 'min-w-28 shrink-0',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary active:scale-[0.98]',
                  active ? 'bg-primary text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                {workflowLoaded && <StageDot stage={stage} className={active ? 'ring-1 ring-white' : undefined} />}
                <span className="truncate">{stage.name}</span>
                <span
                  className={cn(
                    'rounded-md px-1.5 text-[11px] font-medium tabular-nums',
                    active ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {(columns[stage.key] ?? []).length}
                  <span className="sr-only"> tasks</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Announces every move; on phones it doubles as an inline "Moved to ... · View" chip */}
      <div role="status" aria-live="polite" className={cn(movedTo ? 'mb-3 flex md:mb-0 md:sr-only' : 'sr-only')}>
        {movedTo && (
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-800 pr-1 pl-4 text-xs font-medium text-white md:min-h-0">
            <span>Moved to {movedTo.name}</span>
            {movedTo.key !== activeColumn && (
              <button
                type="button"
                aria-label={`View ${movedTo.name}`}
                onClick={() => setActiveColumn(movedTo.key)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-white md:hidden"
              >
                <span aria-hidden>·</span> View
              </button>
            )}
          </span>
        )}
      </div>

      {laneMode ? (
        <BoardSwimlanes
          lanes={lanes}
          header={stages.map(stage => renderHeader(stage, 'rounded-xl border border-slate-100 bg-slate-50/70 md:pt-2 md:pb-2'))}
          columns={stages.map(stage => ({ key: stage.key, label: stage.name, dot: STAGE_COLOR_META[stage.color].dot }))}
          columnOf={task => stageOf(task).key}
          renderCell={renderColumn}
        />
      ) : (
        <div
          data-testid="board-columns"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => { swipeOrigin.current = null; }}
          style={stages.length === 3 ? undefined : ({ '--board-cols': `repeat(${stages.length}, minmax(${stages.length > 3 ? '15rem' : '0px'}, 1fr))` } as CSSProperties)}
          className={cn(
            'md:grid md:items-start md:gap-4 lg:gap-5',
            stages.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-(--board-cols)',
            stages.length > 3 && 'md:overflow-x-auto md:pb-2',
          )}
        >
          {stages.map(stage => renderColumn(lanes[0], stage.key))}
        </div>
      )}

      <MoveTaskSheet
        open={sheetOpen && canWrite}
        onOpenChange={setSheetOpen}
        task={sheetTask}
        counts={{ pending: 0, 'in-progress': 0, completed: 0 }}
        onMove={() => undefined}
        stages={stages}
        stageCounts={Object.fromEntries(Object.entries(columns).map(([key, list]) => [key, list.length]))}
        onMoveToStage={handleMoveToStage}
      />
      {wipDialog && (
        <WipLimitsDialog limits={limits} focusStatus={wipDialog} onClose={() => setWipDialog(null)} onSave={saveLimits} />
      )}
    </div>
  );
};

interface ColumnHeaderProps {
  stage: WorkflowStage;
  /** True once the workspace workflow is loaded: limits are edited in Settings > Workflow. */
  workflowLoaded: boolean;
  /** Cards shown in the column. */
  count: number;
  /** Cards in the whole column, whatever the filters hide; compared with the limit. */
  wipCount: number;
  limit: number | null;
  canAdd: boolean;
  onAdd: () => void;
  canManage: boolean;
  onManage: () => void;
  className?: string;
}

/** Column title with its count; turns red with "5 / 4" when the (soft) WIP limit is exceeded. */
const ColumnHeader = ({ stage, workflowLoaded, count, wipCount, limit, canAdd, onAdd, canManage, onManage, className }: ColumnHeaderProps) => {
  const over = isOverWip(wipCount, limit);
  const label = stage.name;
  const inRouter = useInRouterContext();
  const { workspaceSlug } = useParams();
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-1 px-3 pt-1 pb-1 md:px-4 md:pt-4 md:pb-3',
        over && 'rounded-t-2xl bg-red-50',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <StageDot stage={stage} />
        <h2 className="truncate text-sm font-semibold text-slate-700">{label}</h2>
        <span
          title={limit === null ? undefined : `WIP limit ${limit}`}
          className={cn(
            'rounded-md border bg-white px-1.5 text-xs font-medium tabular-nums',
            over ? 'border-red-300 text-red-700' : 'border-slate-200 text-slate-600',
          )}
        >
          {limit === null ? count : wipCountLabel(wipCount, limit)}
        </span>
        {over && (
          <>
            <TriangleAlert aria-hidden className="size-4 shrink-0 text-red-700" />
            <span className="sr-only">over WIP limit</span>
          </>
        )}
      </div>
      <div className="flex items-center">
        {canAdd && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Add task to ${label}`}
            onClick={onAdd}
            className="size-11 text-slate-600 hover:bg-slate-200 hover:text-slate-800 md:size-7"
          >
            <Plus />
          </Button>
        )}
        {canManage && (!workflowLoaded || (inRouter && workspaceSlug)) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Options for ${label} column`}
                  className="size-11 text-slate-600 hover:bg-slate-200 hover:text-slate-800 md:size-7"
                />
              }
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {workflowLoaded ? (
                <DropdownMenuItem
                  render={<Link to={`/${workspaceSlug}/settings/workflow`} />}
                  className="min-h-11 text-slate-700 md:min-h-0"
                >
                  Edit stages and limits…
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onManage} className="min-h-11 text-slate-700 md:min-h-0">
                  Set WIP limits…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
};

const DropIndicator = () => <div aria-hidden className="my-1 h-0.5 rounded-full bg-primary" />;

interface BoardCardProps {
  task: Task;
  dragging: boolean;
  /** Drag and drop is a desktop pointer feature; phones use the quick action, menu and sheet. */
  canDrag: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onOpen?: (task: Task) => void;
  /** Workflow stages in board order, and the move to one of them. */
  stages: WorkflowStage[];
  onMoveToStage: (task: Task, stage: WorkflowStage) => void;
  onOpenMoveSheet: (task: Task) => void;
  canWrite: boolean;
  canDelete: boolean;
  subtaskCount: number;
  subtasksDone: number;
}

const BoardCard = ({ task, subtaskCount, subtasksDone, dragging, canDrag, onDragStart, onDragEnd, onEdit, onDelete, onOpen, stages, onMoveToStage, onOpenMoveSheet, canWrite, canDelete }: BoardCardProps) => {
  const completed = task.status === 'completed';
  const quick = quickMoveFor(stages, resolveStage(task, stages));
  const QuickIcon = QUICK_ICONS[quick.verb];

  // Long-press (touch) opens the move sheet; moving the finger or dragging cancels it.
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const cancelPress = () => {
    clearTimeout(pressTimer.current);
    pressOrigin.current = null;
  };
  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    longPressed.current = false;
    if (!canWrite || event.pointerType === 'mouse' || (event.target as HTMLElement).closest('[data-no-longpress]')) return;
    cancelPress();
    pressOrigin.current = { x: event.clientX, y: event.clientY };
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      pressOrigin.current = null;
      onOpenMoveSheet(task);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const origin = pressOrigin.current;
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > LONG_PRESS_SLOP) cancelPress();
  };

  return (
    <article
      draggable={canDrag}
      onDragStart={event => {
        cancelPress();
        onDragStart(event);
      }}
      onDragEnd={onDragEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onClickCapture={event => {
        // swallow the tap that ends a long-press
        if (!longPressed.current) return;
        longPressed.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      className={cn(
        'group rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs transition-shadow md:p-3.5 hover:shadow-sm',
        canWrite && 'max-md:select-none max-md:[-webkit-touch-callout:none]',
        canDrag && 'cursor-grab active:cursor-grabbing',
        completed && 'bg-slate-50',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Meta row: type (when not a plain task), key, priority icon */}
        <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {task.type && task.type !== 'task' && <TaskTypeIcon type={task.type} />}
          <TaskKey task={task} />
          <PriorityIndicator priority={task.priority} iconOnly className={completed ? 'text-slate-500' : undefined} />
        </div>
        <div data-no-longpress className="-mt-3 -mr-3.5 flex items-center gap-0.5 md:-mt-1 md:-mr-1.5">
          {canWrite && (
            <button
              type="button"
              onClick={() => onMoveToStage(task, quick.to)}
              aria-label={`${quick.verb} ${task.title}: move to ${quick.to.name}`}
              className={cn(
                'inline-flex h-11 items-center gap-1 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 md:hidden',
                'hover:bg-slate-200 active:bg-slate-200 motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
              )}
            >
              {quick.verb}
              <QuickIcon aria-hidden className="size-3.5" />
            </button>
          )}
          <TaskActionsMenu
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpen={onOpen}
            stages={stages}
            onMoveToStage={onMoveToStage}
            onOpenMoveSheet={onOpenMoveSheet}
            canEdit={canWrite}
            canDelete={canDelete}
            subtaskCount={subtaskCount}
            className="size-11 md:size-7 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
          />
        </div>
      </div>

      <button
        type="button"
        data-card-title
        onClick={() => (onOpen ?? onEdit)(task)}
        className={cn(
          'mt-1 block w-full text-left text-sm font-medium text-slate-900 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary rounded',
          completed && 'text-slate-500 line-through',
        )}
      >
        {task.title}
      </button>
      {/* Plain chip (no link): the card itself is draggable and opens the task */}
      {task.project && <ProjectChip name={task.project} link={false} className="mt-1.5 max-w-full" />}
      <LabelList labels={task.labels} max={4} className="mt-2" />
      {task.description && <p className="mt-1 text-xs text-slate-600 line-clamp-2">{task.description}</p>}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 md:mt-3 md:pt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <DueDate deadline={task.deadline} completed={completed} />
          <DependencyCount count={task.dependencies.length} />
          <SubtaskProgress done={subtasksDone} total={subtaskCount} />
          <RelationCount count={task.relations?.length ?? 0} />
          <ChecklistBadge items={task.checklist} />
          <RepeatBadge recurrence={task.recurrence} />
          {(task.comments?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500" title="Comments">
              <MessageSquare className="size-3" aria-hidden />{task.comments?.length}<span className="sr-only"> comments</span>
            </span>
          )}
          {(task.attachments?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500" title="Attachments">
              <Paperclip className="size-3" aria-hidden />{task.attachments?.length}<span className="sr-only"> attachments</span>
            </span>
          )}
        </div>
        <AssigneeStack users={task.assignees} />
      </div>
    </article>
  );
};

export default BoardView;
