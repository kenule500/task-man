import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
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
}

/** Touch-first alternative to drag & drop: a bottom sheet listing the three states as 56px rows. */
const MoveTaskSheet = ({ open, onOpenChange, task, counts, onMove }: MoveTaskSheetProps) => {
  const select = (status: TaskStatus) => {
    if (task && status !== task.status) onMove(task, status);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] motion-reduce:transition-none motion-reduce:duration-0"
      >
        <SheetHeader className="pr-12">
          <SheetTitle>Move task</SheetTitle>
          <SheetDescription className="truncate">{task?.title}</SheetDescription>
        </SheetHeader>
        {task && (
          <ul className="flex flex-col gap-1 px-3">
            {TASK_STATUSES.map(status => {
              const current = status === task.status;
              return (
                <li key={status}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => select(status)}
                    className={cn(
                      'flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-base font-medium text-slate-800 transition-colors',
                      'hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                      current && 'bg-slate-50',
                    )}
                  >
                    <StatusDot status={status} className="size-3" />
                    <span className="flex-1">{STATUS_META[status].label}</span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 text-sm tabular-nums text-slate-500">
                      {counts[status]}
                      <span className="sr-only"> tasks</span>
                    </span>
                    {current ? (
                      <>
                        <Check aria-hidden className="size-5 text-primary" />
                        <span className="sr-only">(current)</span>
                      </>
                    ) : (
                      <span aria-hidden className="size-5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default MoveTaskSheet;
