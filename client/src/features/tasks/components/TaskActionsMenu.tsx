import { ArrowRight, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STATUS_META, TASK_STATUSES } from '../constants';
import type { Task, TaskStatus } from '../types';

interface TaskActionsMenuProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** When provided, adds "Move to …" items (keyboard alternative to drag & drop). */
  onMove?: (task: Task, status: TaskStatus) => void;
  className?: string;
}

const TaskActionsMenu = ({ task, onEdit, onDelete, onMove, className }: TaskActionsMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${task.title}`}
          className={cn('text-slate-400 hover:bg-slate-200 hover:text-slate-600', className)}
        />
      }
    >
      <MoreVertical />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuItem onClick={() => onEdit(task)} className="text-slate-700">
        <Pencil /> Edit
      </DropdownMenuItem>
      {onMove && TASK_STATUSES.filter(status => status !== task.status).map(status => (
        <DropdownMenuItem key={status} onClick={() => onMove(task, status)} className="text-slate-700">
          <ArrowRight /> Move to {STATUS_META[status].label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator className="bg-slate-100" />
      <DropdownMenuItem variant="destructive" onClick={() => onDelete(task)}>
        <Trash2 /> Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default TaskActionsMenu;
