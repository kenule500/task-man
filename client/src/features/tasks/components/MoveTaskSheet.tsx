import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { StageDot } from '@/features/workflow/components/StageBadges';
import { resolveStage } from '@/features/workflow/lib/stages';
import type { WorkflowStage } from '@/features/workflow/types';
import { STATUS_META, TASK_STATUSES } from '../constants';
import type { Task, TaskStatus } from '../types';
import { StatusDot } from './TaskBadges';

interface MoveTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Task being moved; keep it set while the sheet animates out. */
  task: Task | null;
  /** Tasks per status, shown next to each row. */
  counts: Record<TaskStatus, number>;
  onMove: (task: Task, status: TaskStatus) => void;
  /** Workflow stages: with `onMoveToStage` (and `stageCounts`) the rows are the stages instead of the three statuses. */
  stages?: WorkflowStage[];
  stageCounts?: Record<string, number>;
  onMoveToStage?: (task: Task, stage: WorkflowStage) => void;
}

interface Row {
  key: string;
  label: string;
  count: number;
  current: boolean;
  dot: ReactNode;
  move: () => void;
}

/** Touch-first alternative to drag & drop: a bottom sheet listing the board columns as 56px rows. */
const MoveTaskSheet = ({ open, onOpenChange, task, counts, onMove, stages, stageCounts, onMoveToStage }: MoveTaskSheetProps) => {
  const rows: Row[] = !task
    ? []
    : stages && onMoveToStage
      ? stages.map(stage => ({
        key: stage.key,
        label: stage.name,
        count: stageCounts?.[stage.key] ?? 0,
        current: resolveStage(task, stages).key === stage.key,
        dot: <StageDot stage={stage} className="size-3" />,
        move: () => onMoveToStage(task, stage),
      }))
      : TASK_STATUSES.map(status => ({
        key: status,
        label: STATUS_META[status].label,
        count: counts[status],
        current: status === task.status,
        dot: <StatusDot status={status} className="size-3" />,
        move: () => onMove(task, status),
      }));

  const select = (row: Row) => {
    if (!row.current) row.move();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] motion-reduce:transition-none motion-reduce:duration-0"
      >
        <SheetHeader className="pr-12">
          <SheetTitle>Move task</SheetTitle>
          <SheetDescription className="truncate">{task?.title}</SheetDescription>
        </SheetHeader>
        {task && (
          <ul className="flex flex-col gap-1 px-3">
            {rows.map(row => (
              <li key={row.key}>
                <button
                  type="button"
                  aria-current={row.current ? 'true' : undefined}
                  onClick={() => select(row)}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-base font-medium text-slate-800 transition-colors',
                    'hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                    row.current && 'bg-slate-50',
                  )}
                >
                  {row.dot}
                  <span className="flex-1">{row.label}</span>
                  <span className="rounded-md border border-slate-200 bg-white px-2 text-sm tabular-nums text-slate-500">
                    {row.count}
                    <span className="sr-only"> tasks</span>
                  </span>
                  {row.current ? (
                    <>
                      <Check aria-hidden className="size-5 text-primary" />
                      <span className="sr-only">(current)</span>
                    </>
                  ) : (
                    <span aria-hidden className="size-5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default MoveTaskSheet;
