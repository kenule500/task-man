import { Alert, DescriptionItem, DescriptionList, Surface } from '@/components/ds';
import { TASK_TYPE_OPTIONS } from '@/features/tasks/constants';
import { peopleSummary } from '../lib/mapping';
import type { ImportPreview, MappingDraft } from '../types';

const TYPE_LABEL = Object.fromEntries(TASK_TYPE_OPTIONS.map(option => [option.value, option.label]));

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

interface ReviewStepProps {
  preview: ImportPreview;
  draft: MappingDraft;
}

/** Step 4: the numbers and the first rows exactly as they will be created. */
export const ReviewStep = ({ preview, draft }: ReviewStepProps) => {
  const stageName = (key: string | undefined) => preview.stages.find(stage => stage.key === key)?.name ?? '';
  const memberName = (id: string | null | undefined) => preview.members.find(member => member.id === id)?.name ?? '';
  const people = peopleSummary(preview, draft);
  const project = draft.mode === 'existing' ? draft.existingProject : `${draft.newName.trim()} (new)`;

  const typeOf = (raw: string) => TYPE_LABEL[draft.typeMap[raw] ?? 'task'] ?? 'Task';
  const assigneesOf = (identifiers: string[]) =>
    identifiers.map(identifier => memberName(draft.userMap[identifier])).filter(Boolean).join(', ') || 'Unassigned';

  const overLimit = preview.total > preview.limit;

  return (
    <div className="space-y-4">
      {overLimit && (
        <Alert tone="error" title="Too many items">
          An import takes at most {preview.limit.toLocaleString()} items and this file has {preview.total.toLocaleString()}. Split the file and import it in parts.
        </Alert>
      )}

      <Surface as="section" aria-labelledby="import-summary" padding="sm" className="shadow-none">
        <h2 id="import-summary" className="mb-3 text-sm font-semibold text-text-strong">Ready to import</h2>
        <DescriptionList columns={2}>
          <DescriptionItem label="Project">{project}</DescriptionItem>
          <DescriptionItem label="Tasks to create">
            <span className="font-semibold tabular-nums text-text-strong">{preview.total.toLocaleString()}</span>
            {preview.skipped > 0 && <span className="text-text-subtle"> ({plural(preview.skipped, 'row')} left out)</span>}
          </DescriptionItem>
          <DescriptionItem label="Statuses">{plural(preview.statuses.length, 'status', 'statuses')} mapped</DescriptionItem>
          <DescriptionItem label="People">
            {preview.people.length === 0 ? 'No assignees' : `${people.mapped} matched, ${people.unassigned} unassigned`}
          </DescriptionItem>
          <DescriptionItem label="Links">
            {plural(preview.withParent, 'subtask')}, {plural(preview.withEpic, 'epic link')}
          </DescriptionItem>
          <DescriptionItem label="Extras">
            {[
              draft.createSprints && preview.sprints.length > 0 ? plural(preview.sprints.length, 'sprint') : null,
              draft.includeComments && preview.comments > 0 ? plural(preview.comments, 'comment') : null,
              preview.labels.length > 0 ? plural(preview.labels.length, 'label') : null,
            ].filter(Boolean).join(', ') || 'None'}
          </DescriptionItem>
        </DescriptionList>
      </Surface>

      {preview.warnings.length > 0 && (
        <Alert tone="warning" title={preview.warnings.length === 1 ? '1 thing to know' : `${preview.warnings.length} things to know`}>
          <ul className="list-disc space-y-0.5 pl-4">
            {preview.warnings.map(warning => <li key={warning}>{warning}</li>)}
          </ul>
        </Alert>
      )}

      <Surface as="section" padding="none" className="overflow-hidden shadow-none">
        <h2 id="import-rows" className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-text-strong">
          First {Math.min(preview.items.length, 20)} of {preview.total.toLocaleString()}
        </h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Rows to import, scrolls sideways">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-subtle">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Title</th>
                <th scope="col" className="px-2 py-2 font-medium">Column</th>
                <th scope="col" className="px-2 py-2 font-medium">Type</th>
                <th scope="col" className="px-2 py-2 font-medium">Assignee</th>
                <th scope="col" className="px-4 py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.items.map(item => (
                <tr key={item.externalId}>
                  <td className="max-w-[16rem] px-4 py-2 text-text-strong">
                    <span className="block truncate" title={item.title}>{item.title}</span>
                    {(item.parentExternalId || item.epicExternalId) && (
                      <span className="block text-xs text-text-subtle">
                        {item.parentExternalId ? `Subtask of ${item.parentExternalId}` : `In epic ${item.epicExternalId}`}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-text-body">{stageName(draft.statusMap[item.status]) || item.status}</td>
                  <td className="px-2 py-2 text-text-body">{typeOf(item.type)}</td>
                  <td className="max-w-[10rem] px-2 py-2 text-text-body"><span className="block truncate">{assigneesOf(item.assignees)}</span></td>
                  <td className="px-4 py-2 tabular-nums text-text-body">{item.dueDate ?? 'Today'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
      <p className="text-xs text-text-subtle">
        Items without a date get today as their due date, because every task needs one. Nothing is saved until you press Import.
      </p>
    </div>
  );
};
