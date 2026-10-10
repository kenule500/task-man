import { useMemo, useState } from 'react';
import { Plus, Waypoints, X } from 'lucide-react';
import { OptionCombobox, SectionHeader, toast, type ComboboxOption } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { getApiErrorMessage } from '../api';
import { useTaskExtras } from '../hooks/useTaskExtras';
import {
  LINK_TYPE_LABEL, LINK_TYPE_OPTIONS, MAX_TASK_RELATIONS, groupLinks,
} from '../lib/relations';
import { resolveTaskKey } from '../lib/taskKey';
import type { Task, TaskLinkType } from '../types';
import { StatusBadge } from './TaskBadges';
import TaskKey from './TaskKey';
import { OptionSelect } from './TaskSelects';

export interface TaskRelationsProps {
  task: Task;
  /** All workspace tasks: names the linked ones and feeds the search. */
  tasks: Task[];
  /** Holds `tasks:write`: link and unlink. */
  canWrite: boolean;
  /** Workspace slug; defaults to the slug of the project directory. */
  workspaceSlug?: string;
  /** Shows another task in the dialog. */
  onOpen?: (task: Task) => void;
}

/** "Linked work" of a task: links grouped by type, a "Link work" form and an undoable remove button. */
const TaskRelations = ({ task, tasks, canWrite, workspaceSlug, onOpen }: TaskRelationsProps) => {
  const extras = useTaskExtras(workspaceSlug);
  const { byName } = useProjectDirectory();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<TaskLinkType>('relates');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => groupLinks(task, tasks), [task, tasks]);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const keyOf = (item: Task) => resolveTaskKey(item, byName);
  // Every other task, searchable by key or title (the combobox filters on the label)
  const options = useMemo<ComboboxOption[]>(
    () => (adding
      ? tasks.filter(item => item._id !== task._id).map(item => {
        const key = resolveTaskKey(item, byName);
        return { value: item._id, label: key ? `${key} ${item.title}` : item.title };
      })
      : []),
    [adding, task, tasks, byName],
  );
  const canEdit = canWrite && extras.enabled;
  const atLimit = (task.relations?.length ?? 0) >= MAX_TASK_RELATIONS;

  if (!canEdit && total === 0) return null;

  const closeForm = () => {
    setAdding(false);
  };

  const link = async (other: Task) => {
    if (busy) return;
    setBusy(true);
    try {
      await extras.addRelation(task, type, other);
      toast.success(`${LINK_TYPE_LABEL[type]} ${keyOf(other) || other.title}`);
      closeForm();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not link the tasks.'));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (linkType: TaskLinkType, other: Task) => {
    if (busy) return;
    setBusy(true);
    try {
      await extras.removeRelation(task, linkType, other);
      toast({
        title: `Removed link to ${keyOf(other) || other.title}`,
        action: {
          label: 'Undo',
          onClick: () => {
            extras.addRelation(task, linkType, other).catch(err => {
              toast.error(getApiErrorMessage(err, 'Could not restore the link.'));
            });
          },
        },
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not remove the link.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Linked work">
      <SectionHeader
        title="Linked work"
        count={total}
        icon={<Waypoints className="size-4 text-slate-500" aria-hidden />}
        action={canEdit && !adding ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding(true)}
            disabled={atLimit}
            className="h-10 shrink-0 gap-1.5 border-slate-300 text-slate-700 sm:h-8"
          >
            <Plus className="size-4" aria-hidden /> Link work
          </Button>
        ) : undefined}
        className="mb-2"
      />

      {total === 0 && !adding && <p className="text-sm text-slate-500">No linked work yet.</p>}

      {groups.length > 0 && (
        <div className="space-y-3">
          {groups.map(group => (
            <div key={group.type}>
              <h4 className="mb-1 text-xs font-medium text-slate-500">{LINK_TYPE_LABEL[group.type]}</h4>
              <ul aria-label={LINK_TYPE_LABEL[group.type]} className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {group.items.map(other => (
                  <li key={other._id} className="flex min-h-11 items-center gap-2 px-3 py-1">
                    <TaskKey task={other} preview={other} />
                    {onOpen ? (
                      <button
                        type="button"
                        onClick={() => onOpen(other)}
                        className="min-h-8 min-w-0 flex-1 truncate rounded text-left text-sm font-medium text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {other.title}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{other.title}</span>
                    )}
                    <StatusBadge status={other.status} className="shrink-0 px-2 py-0.5" />
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove link: ${LINK_TYPE_LABEL[group.type].toLowerCase()} ${other.title}`}
                        disabled={busy}
                        onClick={() => { void unlink(group.type, other); }}
                        className="size-10 shrink-0 text-slate-500 hover:bg-danger-bg hover:text-danger-fg sm:size-8"
                      >
                        <X />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {canEdit && adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <OptionSelect
              value={type}
              options={LINK_TYPE_OPTIONS}
              onChange={setType}
              aria-label="Link type"
              className="h-11 sm:h-9 sm:w-44"
            />
            <div className="min-w-0 sm:flex-1">
              <OptionCombobox
                label="Search tasks to link"
                options={options}
                value={null}
                onValueChange={id => {
                  const other = tasks.find(item => item._id === id);
                  if (other) void link(other);
                }}
                placeholder="Search by key or title"
                emptyText="No matching tasks."
                disabled={busy}
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={closeForm} className="h-10 text-slate-600 sm:h-8">Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default TaskRelations;
