import { useMemo, type ReactNode } from 'react';
import { Field, OptionCombobox, SegmentedControl, SwitchField, Surface, Tag, fieldMessageId, type ComboboxOption } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { TASK_TYPE_OPTIONS } from '@/features/tasks/constants';
import type { TaskType } from '@/features/tasks/types';
import { GROUP_LABEL } from '@/features/workflow/lib/stages';
import { normalizeProjectKey, suggestProjectKey, type Project } from '@/features/projects';
import type { MappingProblems } from '../lib/mapping';
import type { ImportPreview, MappingDraft } from '../types';
import { MapSelect, type MapOptionGroup } from './MapSelect';

const Section = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <Surface as="section" padding="sm" className="space-y-3 shadow-none">
    <div>
      <h2 className="text-sm font-semibold text-text-strong">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-text-body">{hint}</p>}
    </div>
    {children}
  </Surface>
);

/** One mapping row: what the file calls it (and how many) on the left, the choice on the right. */
const Row = ({ name, count, children }: { name: string; count: number; children: ReactNode }) => (
  <li className="grid gap-1.5 sm:grid-cols-2 sm:items-center sm:gap-4">
    <p className="min-w-0 text-sm text-text-strong">
      <span className="break-words font-medium">{name}</span>
      <span className="ml-2 text-xs text-text-subtle tabular-nums">{count} {count === 1 ? 'item' : 'items'}</span>
    </p>
    <div className="min-w-0">{children}</div>
  </li>
);

interface MapStepProps {
  preview: ImportPreview;
  draft: MappingDraft;
  onChange: (draft: MappingDraft) => void;
  projects: readonly Project[];
  canCreateProject: boolean;
  problems: MappingProblems;
}

/** Step 3: where the tasks go and how the file's statuses, people and types map onto this workspace. */
export const MapStep = ({ preview, draft, onChange, projects, canCreateProject, problems }: MapStepProps) => {
  const openProjects = useMemo(() => projects.filter(project => !project.archived), [projects]);
  const projectOptions = useMemo<ComboboxOption[]>(
    () => openProjects.map(project => ({ value: project.name, label: project.name, description: project.key })),
    [openProjects],
  );
  const memberOptions = useMemo<ComboboxOption[]>(
    () => preview.members.map(member => ({ value: member.id, label: member.name })),
    [preview.members],
  );
  const stageGroups = useMemo<MapOptionGroup[]>(() => (['pending', 'in-progress', 'completed'] as const)
    .map(group => ({
      label: GROUP_LABEL[group],
      options: preview.stages.filter(stage => stage.group === group).map(stage => ({ value: stage.key, label: stage.name })),
    }))
    .filter(group => group.options.length > 0), [preview.stages]);
  const typeGroups = useMemo<MapOptionGroup[]>(
    () => [{ options: TASK_TYPE_OPTIONS.map(option => ({ value: option.value, label: option.label })) }],
    [],
  );

  const set = (patch: Partial<MappingDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="space-y-4">
      <Section title="Project" hint="All imported tasks go into one project.">
        <SegmentedControl
          aria-label="Target project"
          value={draft.mode}
          onValueChange={mode => set({ mode })}
          options={[
            { value: 'existing', label: 'Existing project', disabled: openProjects.length === 0 },
            { value: 'new', label: 'New project', disabled: !canCreateProject },
          ]}
        />
        {draft.mode === 'existing' ? (
          <Field label="Project" htmlFor="import-project" error={problems.project} required>
            <OptionCombobox
              id="import-project"
              label="Project"
              placeholder="Search projects"
              options={projectOptions}
              value={draft.existingProject || null}
              onValueChange={value => set({ existingProject: value ?? '' })}
              invalid={Boolean(problems.project)}
              aria-describedby={problems.project ? fieldMessageId('import-project') : undefined}
            />
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="Project name" htmlFor="import-project-name" error={problems.project} required>
              <Input
                id="import-project-name"
                value={draft.newName}
                maxLength={80}
                onChange={event => {
                  const newName = event.target.value;
                  // The key follows the name until the person types their own
                  const followsName = draft.newKey === '' || draft.newKey === suggestProjectKey(draft.newName);
                  set({ newName, ...(followsName ? { newKey: suggestProjectKey(newName) } : {}) });
                }}
                className="h-11 sm:h-9"
                aria-invalid={Boolean(problems.project)}
                aria-describedby={problems.project ? fieldMessageId('import-project-name') : undefined}
              />
            </Field>
            <Field label="Key" htmlFor="import-project-key" error={problems.key} hint="Like WEB-12">
              <Input
                id="import-project-key"
                value={draft.newKey}
                onChange={event => set({ newKey: normalizeProjectKey(event.target.value) })}
                className="h-11 uppercase sm:h-9"
                aria-invalid={Boolean(problems.key)}
                aria-describedby={fieldMessageId('import-project-key')}
              />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Statuses" hint="Choose the column each status lands in.">
        <ul className="space-y-3">
          {preview.statuses.map((status, index) => (
            <Row key={status.name} name={status.name} count={status.count}>
              <MapSelect
                id={index === 0 ? 'import-first-status' : undefined}
                aria-label={`Column for ${status.name}`}
                value={draft.statusMap[status.name] ?? ''}
                groups={stageGroups}
                onChange={value => set({ statusMap: { ...draft.statusMap, [status.name]: value } })}
              />
            </Row>
          ))}
        </ul>
      </Section>

      {preview.people.length > 0 && (
        <Section title="People" hint="Match people in the file to members of this workspace. Leave a person unassigned if there is no match.">
          <ul className="space-y-3">
            {preview.people.map(person => (
              <Row key={person.identifier} name={person.identifier} count={person.count}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1 basis-40">
                    <OptionCombobox
                      label={`Member for ${person.identifier}`}
                      placeholder="Unassigned"
                      options={memberOptions}
                      value={draft.userMap[person.identifier] ?? null}
                      onValueChange={value => set({ userMap: { ...draft.userMap, [person.identifier]: value } })}
                      clearable
                    />
                  </div>
                  {person.isMember && <Tag tone="success" size="sm">Matched</Tag>}
                </div>
              </Row>
            ))}
          </ul>
        </Section>
      )}

      {preview.types.length > 0 && (
        <Section title="Types" hint="Choose the task type for each type in the file.">
          <ul className="space-y-3">
            {preview.types.map(type => (
              <Row key={type.name} name={type.name} count={type.count}>
                <MapSelect
                  aria-label={`Task type for ${type.name}`}
                  value={draft.typeMap[type.name] ?? 'task'}
                  groups={typeGroups}
                  onChange={value => set({ typeMap: { ...draft.typeMap, [type.name]: value as TaskType } })}
                />
              </Row>
            ))}
          </ul>
        </Section>
      )}

      {(preview.sprints.length > 0 || preview.comments > 0) && (
        <Section title="Options">
          <div className="space-y-4">
            {preview.sprints.length > 0 && (
              <SwitchField
                label="Create the sprints named in the file"
                description={`${preview.sprints.length} ${preview.sprints.length === 1 ? 'sprint' : 'sprints'}: ${preview.sprints.slice(0, 4).map(sprint => sprint.name).join(', ')}${preview.sprints.length > 4 ? '…' : ''}. Sprints that already exist in the project are reused. Without this, those items go to the backlog.`}
                checked={draft.createSprints}
                onCheckedChange={createSprints => set({ createSprints })}
              />
            )}
            {preview.comments > 0 && (
              <SwitchField
                label="Import comments"
                description={`${preview.comments} ${preview.comments === 1 ? 'comment' : 'comments'}. Authors who match a member keep their name; others show as written by you.`}
                checked={draft.includeComments}
                onCheckedChange={includeComments => set({ includeComments })}
              />
            )}
          </div>
        </Section>
      )}
    </div>
  );
};
