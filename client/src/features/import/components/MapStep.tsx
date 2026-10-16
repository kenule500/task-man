import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
const Row = ({ name, count, children }: { name: string; count: number; children: ReactNode }) => {
  const { t } = useTranslation('admin');
  return (
  <li className="grid gap-1.5 sm:grid-cols-2 sm:items-center sm:gap-4">
    <p className="min-w-0 text-sm text-text-strong">
      <span className="break-words font-medium">{name}</span>
      <span className="ms-2 text-xs text-text-subtle tabular-nums">{t('import.n.item', { count, n: count })}</span>
    </p>
    <div className="min-w-0">{children}</div>
  </li>
  );
};

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
  const { t } = useTranslation('admin');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- group labels follow the language
    .filter(group => group.options.length > 0), [preview.stages, t]);
  const typeGroups = useMemo<MapOptionGroup[]>(
    () => [{ options: TASK_TYPE_OPTIONS.map(option => ({ value: option.value, label: t(`tasks:type.${option.value}`) })) }],
    [t],
  );

  const set = (patch: Partial<MappingDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="space-y-4">
      <Section title={t('import.map.project')} hint={t('import.map.projectHint')}>
        <SegmentedControl
          aria-label={t('import.map.targetProject')}
          value={draft.mode}
          onValueChange={mode => set({ mode })}
          options={[
            { value: 'existing', label: t('import.map.existing'), disabled: openProjects.length === 0 },
            { value: 'new', label: t('import.map.new'), disabled: !canCreateProject },
          ]}
        />
        {draft.mode === 'existing' ? (
          <Field label={t('import.map.project')} htmlFor="import-project" error={problems.project} required>
            <OptionCombobox
              id="import-project"
              label={t('import.map.project')}
              placeholder={t('import.map.searchProjects')}
              options={projectOptions}
              value={draft.existingProject || null}
              onValueChange={value => set({ existingProject: value ?? '' })}
              invalid={Boolean(problems.project)}
              aria-describedby={problems.project ? fieldMessageId('import-project') : undefined}
            />
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label={t('import.map.projectName')} htmlFor="import-project-name" error={problems.project} required>
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
            <Field label={t('import.map.key')} htmlFor="import-project-key" error={problems.key} hint={t('import.map.keyHint')}>
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

      <Section title={t('import.map.statuses')} hint={t('import.map.statusesHint')}>
        <ul className="space-y-3">
          {preview.statuses.map((status, index) => (
            <Row key={status.name} name={status.name} count={status.count}>
              <MapSelect
                id={index === 0 ? 'import-first-status' : undefined}
                aria-label={t('import.map.columnFor', { name: status.name })}
                value={draft.statusMap[status.name] ?? ''}
                groups={stageGroups}
                onChange={value => set({ statusMap: { ...draft.statusMap, [status.name]: value } })}
              />
            </Row>
          ))}
        </ul>
      </Section>

      {preview.people.length > 0 && (
        <Section title={t('import.map.people')} hint={t('import.map.peopleHint')}>
          <ul className="space-y-3">
            {preview.people.map(person => (
              <Row key={person.identifier} name={person.identifier} count={person.count}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1 basis-40">
                    <OptionCombobox
                      label={t('import.map.memberFor', { name: person.identifier })}
                      placeholder={t('import.map.unassigned')}
                      options={memberOptions}
                      value={draft.userMap[person.identifier] ?? null}
                      onValueChange={value => set({ userMap: { ...draft.userMap, [person.identifier]: value } })}
                      clearable
                    />
                  </div>
                  {person.isMember && <Tag tone="success" size="sm">{t('import.map.matched')}</Tag>}
                </div>
              </Row>
            ))}
          </ul>
        </Section>
      )}

      {preview.types.length > 0 && (
        <Section title={t('import.map.types')} hint={t('import.map.typesHint')}>
          <ul className="space-y-3">
            {preview.types.map(type => (
              <Row key={type.name} name={type.name} count={type.count}>
                <MapSelect
                  aria-label={t('import.map.typeFor', { name: type.name })}
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
        <Section title={t('import.map.options')}>
          <div className="space-y-4">
            {preview.sprints.length > 0 && (
              <SwitchField
                label={t('import.map.createSprints')}
                description={t('import.map.sprintsDescription', { count: preview.sprints.length, names: preview.sprints.slice(0, 4).map(sprint => sprint.name).join(', '), more: preview.sprints.length > 4 ? '…' : '' })}
                checked={draft.createSprints}
                onCheckedChange={createSprints => set({ createSprints })}
              />
            )}
            {preview.comments > 0 && (
              <SwitchField
                label={t('import.map.importComments')}
                description={t('import.map.commentsDescription', { count: preview.comments })}
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
