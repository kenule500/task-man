import { useState } from 'react';
import { ArrowUpFromLine, Copy, CornerDownRight, Eye, MoreHorizontal, MoveRight, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getCached, tasksKey } from '@/lib/queryCache';
import { toast } from '@/components/ds';
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getApiErrorMessage } from '../api';
import { TASK_STATUSES } from '../constants';
import { useTaskExtras } from '../hooks/useTaskExtras';
import type { Task, TaskStatus } from '../types';
import { canBecomeSubtask } from '../lib/relations';
import ConvertToSubtaskDialog from './ConvertToSubtaskDialog';
import { StageDot } from '@/features/workflow/components/StageBadges';
import { resolveStage } from '@/features/workflow/lib/stages';
import type { WorkflowStage } from '@/features/workflow/types';
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
  /** Workflow stages: with `onMoveToStage` the "Move to" group lists the stages instead of the three statuses. */
  stages?: WorkflowStage[];
  onMoveToStage?: (task: Task, stage: WorkflowStage) => void;
  /** When provided (with `onMove`), adds a "Move to…" item below `md` that opens the move sheet. */
  onOpenMoveSheet?: (task: Task) => void;
  /** Called with the copy after "Duplicate" succeeded (the lists refresh by themselves). Needs `canEdit`. */
  onDuplicated?: (copy: Task) => void;
  /** Direct subtasks of the task; "Duplicate" copies them too when there are any. */
  subtaskCount?: number;
  /** Workspace slug for "Duplicate"; defaults to the slug of the project directory. */
  workspaceSlug?: string;
  /** Workspace tasks the "Convert to subtask" picker chooses from; defaults to the shared tasks cache. */
  tasks?: Task[];
  /** Called with the updated task after "Convert to subtask" or "Promote to task". */
  onMoved?: (task: Task) => void;
  className?: string;
}

/** 40px rows on touch, compact from `md`. */
const ITEM_CLASS = 'min-h-11 text-slate-700 md:min-h-0';

const TaskActionsMenu = ({
  task, onEdit, onDelete, onOpen, onMove, stages, onMoveToStage, onOpenMoveSheet, onDuplicated, subtaskCount = 0, workspaceSlug, tasks, onMoved, canEdit = true, canDelete = true, className,
}: TaskActionsMenuProps) => {
  const { t } = useTranslation('tasks');
  const extras = useTaskExtras(workspaceSlug);
  const canDuplicate = canEdit && extras.enabled;
  const directory = useProjectDirectory();
  const [picking, setPicking] = useState(false);
  const canConvert = canDuplicate && !task.parent && canBecomeSubtask(task, subtaskCount);
  const canPromote = canDuplicate && Boolean(task.parent);

  /** Makes the task a subtask of `parent` (a top-level task for `null`); false when it failed. */
  const moveTo = async (parent: Task | null): Promise<boolean> => {
    try {
      const moved = await extras.moveTask(task, parent ? parent._id : null);
      toast.success(parent ? t('menu.nowSubtask', { task: task.title, parent: parent.title }) : t('menu.nowTask', { task: task.title }));
      onMoved?.(moved);
      return true;
    } catch (err) {
      toast.error(getApiErrorMessage(err, parent ? t('menu.convertError') : t('menu.promoteError')));
      return false;
    }
  };

  const duplicate = async () => {
    try {
      const copy = await extras.duplicateTask(task, subtaskCount > 0);
      toast.success(t('menu.created', { title: copy.title }));
      onDuplicated?.(copy);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('menu.duplicateError')));
    }
  };

  if (!onOpen && !canEdit && !canDelete) return null;

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('menu.actionsFor', { title: task.title })}
            className={cn('size-10 text-slate-500 hover:bg-slate-200 hover:text-slate-600 md:size-7', className)}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 md:w-48">
        {/* "Move to" is the touch / keyboard alternative to drag & drop */}
        {canEdit && (onMove || (stages && onMoveToStage)) && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('menu.moveTo')}</DropdownMenuLabel>
              {stages && onMoveToStage ? (
                <DropdownMenuRadioGroup
                  value={resolveStage(task, stages).key}
                  onValueChange={value => {
                    const target = stages.find(stage => stage.key === value);
                    if (target) onMoveToStage(task, target);
                  }}
                >
                  {stages.map(stage => (
                    <DropdownMenuRadioItem key={stage.key} value={stage.key} className="min-h-11 text-slate-700 md:min-h-0">
                      <StageDot stage={stage} />{stage.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              ) : (
                <DropdownMenuRadioGroup value={task.status} onValueChange={value => onMove?.(task, value as TaskStatus)}>
                  {TASK_STATUSES.map(status => (
                    <DropdownMenuRadioItem key={status} value={status} className="min-h-11 text-slate-700 md:min-h-0">
                      <StatusDot status={status} />{t(`status.${status}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
              {onOpenMoveSheet && (
                <DropdownMenuItem onClick={() => onOpenMoveSheet(task)} className={cn(ITEM_CLASS, 'md:hidden')}>
                  <MoveRight className="rtl:-scale-x-100" /> {t('menu.moveToEllipsis')}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-slate-100" />
          </>
        )}
        {onOpen && (
          <DropdownMenuItem onClick={() => onOpen(task)} className={ITEM_CLASS}>
            <Eye /> {t('menu.viewDetails')}
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onClick={() => onEdit(task)} className={ITEM_CLASS}>
            <Pencil /> {t('actions.edit')}
          </DropdownMenuItem>
        )}
        {canDuplicate && (
          <DropdownMenuItem onClick={() => { void duplicate(); }} className={ITEM_CLASS}>
            <Copy /> {t('menu.duplicate')}
          </DropdownMenuItem>
        )}
        {canConvert && (
          <DropdownMenuItem onClick={() => setPicking(true)} className={ITEM_CLASS}>
            <CornerDownRight className="rtl:-scale-x-100" /> {t('menu.convert')}
          </DropdownMenuItem>
        )}
        {canPromote && (
          <DropdownMenuItem onClick={() => { void moveTo(null); }} className={ITEM_CLASS}>
            <ArrowUpFromLine /> {t('menu.promote')}
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            {(onOpen || canEdit) &&<DropdownMenuSeparator className="bg-slate-100" />}
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(task)} className="min-h-11 md:min-h-0">
              <Trash2 /> {t('actions.delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    {picking && (
      <ConvertToSubtaskDialog
        open
        onOpenChange={setPicking}
        task={task}
        tasks={tasks ?? getCached<Task[]>(tasksKey(workspaceSlug || directory.slug || '')) ?? []}
        onPick={moveTo}
      />
    )}
    </>
  );
};

export default TaskActionsMenu;
