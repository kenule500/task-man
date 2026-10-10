import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, Field, PageHeader, SectionHeader, SegmentedControl, SkeletonList, Surface, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import SelectField from '@/features/planning/components/SelectField';
import WorkloadList from '@/features/planning/components/WorkloadList';
import { MAX_CAPACITY, MIN_CAPACITY, loadCapacity, parseCapacity, saveCapacity } from '@/features/planning/lib/capacity';
import {
  aggregateWorkload, defaultWorkloadProject, defaultWorkloadSprint, tasksInScope,
  type WorkloadScope,
} from '@/features/planning/lib/workload';
import { formatSprintRange, useProjects, type Project } from '@/features/projects';
import { addDays, resolveTaskKey, toDateKey, useTasks, type Task } from '@/features/tasks';

type ScopeKind = 'sprint' | 'range';

const SCOPE_OPTIONS = [
  { value: 'sprint', label: 'Sprint' },
  { value: 'range', label: 'Date range' },
] as const;

const nameKey = (name: string | undefined) => (name ?? '').trim().toLowerCase();

/** Story points and items per assignee against a capacity, for a sprint or a date range. */
const WorkloadPage = () => {
  const { workspaceSlug = '' } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();
  const { tasks, loading: tasksLoading, error: tasksError, clearError } = useTasks(can('tasks:read') ? workspaceSlug : undefined);
  const { projects, loading: projectsLoading, error: projectsError } = useProjects(workspaceSlug);

  const [kind, setKind] = useState<ScopeKind>('sprint');
  const [projectChoice, setProjectChoice] = useState('');
  const [sprintChoice, setSprintChoice] = useState('');
  const [range, setRange] = useState(() => ({ from: toDateKey(new Date()), to: toDateKey(addDays(new Date(), 13)) }));
  const [openId, setOpenId] = useState<string | null>(null);

  // Capacity is kept per workspace in the browser; the text box may hold a half-typed value
  const [stored, setStored] = useState(() => ({ slug: workspaceSlug, value: loadCapacity(workspaceSlug) }));
  const capacity = stored.slug === workspaceSlug ? stored.value : loadCapacity(workspaceSlug);
  const [capacityText, setCapacityText] = useState(String(capacity));
  const capacityError = parseCapacity(capacityText) === null
    ? `Enter a whole number from ${MIN_CAPACITY} to ${MAX_CAPACITY}.`
    : '';
  const changeCapacity = (text: string) => {
    setCapacityText(text);
    const value = parseCapacity(text);
    if (value === null) return;
    setStored({ slug: workspaceSlug, value });
    saveCapacity(workspaceSlug, value);
  };

  const openProjects = useMemo(() => projects.filter(project => !project.archived), [projects]);
  const fallbackProject = useMemo(() => defaultWorkloadProject(projects), [projects]);

  // Sprint scope needs a project; a date range may cover all of them
  const project: Project | undefined = kind === 'sprint'
    ? openProjects.find(item => item._id === projectChoice) ?? fallbackProject
    : openProjects.find(item => item._id === projectChoice);
  const sprint = project?.sprints.find(item => item._id === sprintChoice) ?? defaultWorkloadSprint(project);

  const sprintId = sprint?._id;
  const projectName = project?.name;
  const { from, to } = range;
  const rangeInvalid = kind === 'range' && (!from || !to || from > to);

  // Cheap enough to compute each render
  const scope: WorkloadScope | null = kind === 'sprint'
    ? (sprintId ? { kind: 'sprint', sprintId } : null)
    : (rangeInvalid ? null : { kind: 'range', from, to, projectName });
  const workload = scope ? aggregateWorkload(tasksInScope(tasks, scope), capacity) : null;

  const keyOf = (task: Task) => resolveTaskKey(
    task,
    name => projects.find(item => nameKey(item.name) === nameKey(name ?? undefined)),
  );

  const toggle = (id: string) => setOpenId(current => (current === id ? null : id));
  const loading = tasksLoading || projectsLoading;
  const error = tasksError || projectsError;

  const projectOptions = [
    ...(kind === 'range' ? [{ value: '', label: 'All projects' }] : []),
    ...openProjects.map(item => ({ value: item._id, label: item.name })),
  ];
  const sprintOptions = (project?.sprints ?? []).map(item => ({ value: item._id, label: `${item.name} (${item.status})` }));

  return (
    <AppShell>
      <PageHeader
        title="Workload"
        description="Story points and items per person against their capacity. Select a person to see their tasks."
      />

      {loading ? (
        <SkeletonList label="Loading workload" rows={4} />
      ) : (
        <>
          {error && <Alert tone="error" onDismiss={tasksError ? clearError : undefined}>{error}</Alert>}

          <Surface as="section" aria-label="Workload scope" padding="sm" className="sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_9rem] lg:items-end">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Scope</span>
                <SegmentedControl
                  aria-label="Scope"
                  options={SCOPE_OPTIONS.map(option => ({ ...option }))}
                  value={kind}
                  onValueChange={value => { setKind(value); setOpenId(null); }}
                />
              </div>

              {projectOptions.length > 0 && (
                <SelectField
                  label="Project"
                  value={kind === 'sprint' ? project?._id ?? '' : projectChoice}
                  onValueChange={value => { setProjectChoice(value); setSprintChoice(''); setOpenId(null); }}
                  options={projectOptions}
                />
              )}

              {kind === 'sprint' ? (
                <SelectField
                  label="Sprint"
                  value={sprint?._id ?? ''}
                  onValueChange={value => { setSprintChoice(value); setOpenId(null); }}
                  options={sprintOptions.length > 0 ? sprintOptions : [{ value: '', label: 'No sprints' }]}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From" htmlFor="workload-from" className="text-xs">
                    <Input id="workload-from" type="date" value={range.from} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} className="h-11 bg-white md:h-9" />
                  </Field>
                  <Field label="To" htmlFor="workload-to" className="text-xs">
                    <Input id="workload-to" type="date" value={range.to} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} className="h-11 bg-white md:h-9" />
                  </Field>
                </div>
              )}

              <Field
                label="Capacity (points)"
                htmlFor="workload-capacity"
                error={capacityError || undefined}
                hint="Per person for this scope"
              >
                <Input
                  id="workload-capacity"
                  type="number"
                  inputMode="numeric"
                  min={MIN_CAPACITY}
                  max={MAX_CAPACITY}
                  value={capacityText}
                  onChange={event => changeCapacity(event.target.value)}
                  aria-invalid={Boolean(capacityError)}
                  aria-describedby={fieldMessageId('workload-capacity')}
                  className="h-11 bg-white md:h-9"
                />
              </Field>
            </div>
            {rangeInvalid && <p role="alert" className="mt-3 text-sm text-danger-fg">The start date must be on or before the end date.</p>}
          </Surface>

          {workload === null ? (
            <Surface padding="none">
              <EmptyState
                icon={<Users />}
                title={kind === 'sprint' ? 'No sprint to show' : 'Choose a valid date range'}
                description={kind === 'sprint'
                  ? 'Plan a sprint in a project and assign its tasks. Or switch to a date range to see work by due date.'
                  : 'Pick a start date that is on or before the end date.'}
              />
            </Surface>
          ) : workload.itemCount === 0 ? (
            <Surface padding="none">
              <EmptyState
                icon={<Users />}
                title="No work in this scope"
                description={kind === 'sprint'
                  ? 'This sprint has no tasks yet. Add tasks to it from the project page, then assign them to see who carries what.'
                  : 'No tasks fall between these dates. Widen the range or pick another project.'}
              />
            </Surface>
          ) : (
            <Surface as="section" aria-labelledby="workload-people" padding="none" className="overflow-hidden">
              <div className="border-b border-slate-100 px-3 pt-4 sm:px-4">
                <SectionHeader
                  title={<span id="workload-people">{kind === 'sprint' && sprint ? `${sprint.name} · ${formatSprintRange(sprint)}` : 'Load by person'}</span>}
                  count={workload.people.length + (workload.unassigned.items.total > 0 ? 1 : 0)}
                  className="mb-3"
                />
                <p className="-mt-1 mb-3 text-xs tabular-nums text-slate-600">
                  {workload.itemCount} {workload.itemCount === 1 ? 'item' : 'items'} · {workload.pointCount} pts. A task with several assignees counts for each person.
                </p>
              </div>
              <WorkloadList workload={workload} capacity={capacity} slug={workspaceSlug} openId={openId} onToggle={toggle} keyOf={keyOf} />
            </Surface>
          )}
        </>
      )}
    </AppShell>
  );
};

export default WorkloadPage;
