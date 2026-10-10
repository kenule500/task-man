import { useState, type ReactNode } from 'react';
import { ChevronDown, CircleDot, Flag, Tag, Trash2, UserPlus, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Project } from '@/features/projects';
import type { BulkTaskPatch } from '../api';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../constants';
import LabelInput from './LabelInput';

interface BulkActionBarProps {
  /** Number of selected tasks. */
  count: number;
  /** Applies a change to the selected tasks; omit when the user cannot edit (hides the edit controls). */
  onApply?: (patch: BulkTaskPatch) => void;
  /** Asks to delete the selected tasks; omit without `tasks:delete`. */
  onDelete?: () => void;
  onClear: () => void;
  /** A request is running: controls are disabled. */
  busy?: boolean;
  /** Members offered by "Assignee"; the control is hidden when empty or missing (no `users:read`). */
  members?: { _id: string; name: string }[];
  /** Projects with sprints for "Sprint"; hidden when no project has an open sprint. */
  projects?: Project[];
  /** Labels already used in the workspace. */
  labelSuggestions?: string[];
}

const TRIGGER = 'h-10 gap-1.5 border-slate-200 bg-white px-3 text-sm text-slate-700 md:h-8 md:px-2.5';
const ITEM = 'min-h-10 text-slate-700 md:min-h-0';

const MenuButton = ({ label, icon, disabled }: { label: string; icon: ReactNode; disabled?: boolean }) => (
  <DropdownMenuTrigger
    disabled={disabled}
    render={<Button type="button" variant="outline" size="sm" className={TRIGGER} />}
  >
    {icon}{label}<ChevronDown className="size-3.5 text-slate-500" aria-hidden />
  </DropdownMenuTrigger>
);

/**
 * Sticky bar shown while list rows are selected: counts the selection and applies one change to all of it.
 * Sits above the phone tab bar (and the home indicator) and floats at the bottom from `md`.
 */
const BulkActionBar = ({
  count, onApply, onDelete, onClear, busy = false, members = [], projects = [], labelSuggestions = [],
}: BulkActionBarProps) => {
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);

  const openSprints = projects
    .map(project => ({ project, sprints: project.sprints.filter(sprint => sprint.status !== 'completed') }))
    .filter(entry => !entry.project.archived && entry.sprints.length > 0);
  const noun = count === 1 ? 'task' : 'tasks';

  const closeLabels = () => {
    setLabelsOpen(false);
    setLabels([]);
  };

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      data-testid="bulk-action-bar"
      className={cn(
        'fixed inset-x-0 z-40 px-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]',
        // Above the 3.5rem tab bar on phones, a floating pill from md
        'bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] md:bottom-6 md:left-1/2 md:right-auto md:w-max md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:px-0',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 pl-4 shadow-lg backdrop-blur md:flex-nowrap md:rounded-xl">
        <p className="mr-auto shrink-0 text-sm font-semibold tabular-nums text-slate-900 md:mr-2">{count} selected</p>

        {onApply && (
          <>
            <DropdownMenu>
              <MenuButton label="Status" icon={<CircleDot className="size-3.5" aria-hidden />} disabled={busy} />
              <DropdownMenuContent align="center" side="top" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Set status for {count} {noun}</DropdownMenuLabel>
                  {STATUS_OPTIONS.map(option => (
                    <DropdownMenuItem key={option.value} className={ITEM} onClick={() => onApply({ status: option.value })}>
                      <span aria-hidden className={cn('size-2 rounded-full', option.dot)} />{option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <MenuButton label="Priority" icon={<Flag className="size-3.5" aria-hidden />} disabled={busy} />
              <DropdownMenuContent align="center" side="top" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Set priority for {count} {noun}</DropdownMenuLabel>
                  {PRIORITY_OPTIONS.map(option => (
                    <DropdownMenuItem key={option.value} className={ITEM} onClick={() => onApply({ priority: option.value })}>
                      <span aria-hidden className={cn('size-2 rounded-full', option.dot)} />{option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {members.length > 0 && (
              <DropdownMenu>
                <MenuButton label="Assignee" icon={<UserPlus className="size-3.5" aria-hidden />} disabled={busy} />
                <DropdownMenuContent align="center" side="top" className="max-h-72 w-56 overflow-y-auto">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Add assignee to {count} {noun}</DropdownMenuLabel>
                    {members.map(member => (
                      <DropdownMenuItem key={member._id} className={ITEM} onClick={() => onApply({ assignees: { add: [member._id] } })}>
                        <span className="truncate">{member.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {openSprints.length > 0 && (
              <DropdownMenu>
                <MenuButton label="Sprint" icon={<Zap className="size-3.5" aria-hidden />} disabled={busy} />
                <DropdownMenuContent align="center" side="top" className="max-h-72 w-60 overflow-y-auto">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Move {count} {noun} to</DropdownMenuLabel>
                    <DropdownMenuItem className={ITEM} onClick={() => onApply({ sprint: null })}>Backlog (no sprint)</DropdownMenuItem>
                  </DropdownMenuGroup>
                  {openSprints.map(({ project, sprints }) => (
                    <DropdownMenuGroup key={project._id}>
                      <DropdownMenuSeparator className="bg-slate-100" />
                      <DropdownMenuLabel>{project.name}</DropdownMenuLabel>
                      {sprints.map(sprint => (
                        <DropdownMenuItem key={sprint._id} className={ITEM} onClick={() => onApply({ sprint: sprint._id })}>
                          <span className="truncate">{sprint.name}</span>
                          {sprint.status === 'active' && <span className="ml-auto text-xs text-emerald-700">Active</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setLabelsOpen(true)}
              className={TRIGGER}
            >
              <Tag className="size-3.5" aria-hidden />Labels
            </Button>
          </>
        )}

        {onDelete && (
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onDelete} className="h-10 gap-1.5 px-3 md:h-8 md:px-2.5">
            <Trash2 className="size-3.5" aria-hidden />Delete
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          aria-label="Clear selection"
          className="h-10 gap-1.5 px-3 text-slate-600 md:h-8 md:px-2.5"
        >
          <X className="size-3.5" aria-hidden />Clear
        </Button>
      </div>

      <Dialog open={labelsOpen} onOpenChange={open => !open && closeLabels()}>
        <DialogContent className="gap-4 border border-slate-200 bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">Add labels to {count} {noun}</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Existing labels stay. If any selected task would end up with more than 10 labels, nothing is changed.
            </DialogDescription>
          </DialogHeader>
          <LabelInput value={labels} onChange={setLabels} suggestions={labelSuggestions} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeLabels} className="h-10 md:h-8">Cancel</Button>
            <Button
              type="button"
              disabled={labels.length === 0 || busy}
              onClick={() => {
                onApply?.({ labels: { add: labels } });
                closeLabels();
              }}
              className="h-10 md:h-8"
            >
              Add {labels.length > 0 ? labels.length : ''} {labels.length === 1 ? 'label' : 'labels'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BulkActionBar;
