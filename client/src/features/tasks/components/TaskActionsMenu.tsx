import { Eye, MoreHorizontal, MoveRight, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STATUS_META, TASK_STATUSES } from '../constants';
import type { Task, TaskStatus } from '../types';
import { StatusDot } from './TaskBadges';

interface TaskActionsMenuProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** When provided, adds a "View details" item. */
  onOpen?: (task: Task) => void;
  /** Without `tasks:write` the Edit and "Move to" items are hidden. */
  canEdit?: boolean;
  /** Without `tasks:delete` the Delete item is hidden. */
  canDelete?: boolean;
  /** When provided, adds a "Move to" radio group (touch / keyboard alternative to drag & drop). */
  onMove?: (task: Task, status: TaskStatus) => void;
  /** When provided (with `onMove`), adds a "Move to…" item below `md` that opens the move sheet. */
  onOpenMoveSheet?: (task: Task) => void;
  className?: string;
}

/** 40px rows on touch, compact from `md`. */
const ITEM_CLASS = 'min-h-10 text-slate-700 md:min-h-0';

const TaskActionsMenu = ({
  task, onEdit, onDelete, onOpen, onMove, onOpenMoveSheet, canEdit = true, canDelete = true, className,
}: TaskActionsMenuProps) => {
  if (!onOpen && !canEdit && !canDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${task.title}`}
            className={cn('size-10 text-slate-400 hover:bg-slate-200 hover:text-slate-600 md:size-7', className)}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 md:w-48">
        {/* "Move to" is the touch / keyboard alternative to drag & drop */}
        {canEdit && onMove && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={task.status} onValueChange={value => onMove(task, value as TaskStatus)}>
                {TASK_STATUSES.map(status => (
                  <DropdownMenuRadioItem key={status} value={status} className="min-h-10 text-slate-700 md:min-h-0">
                    <StatusDot status={status} />{STATUS_META[status].label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {onOpenMoveSheet && (
                <DropdownMenuItem onClick={() => onOpenMoveSheet(task)} className={cn(ITEM_CLASS, 'md:hidden')}>
                  <MoveRight /> Move to…
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-slate-100" />
          </>
        )}
        {onOpen && (
          <DropdownMenuItem onClick={() => onOpen(task)} className={ITEM_CLASS}>
            <Eye /> View details
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onClick={() => onEdit(task)} className={ITEM_CLASS}>
            <Pencil /> Edit
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            {(onOpen || canEdit) &&<DropdownMenuSeparator className="bg-slate-100" />}
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(task)} className="min-h-10 md:min-h-0">
              <Trash2 /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TaskActionsMenu;
