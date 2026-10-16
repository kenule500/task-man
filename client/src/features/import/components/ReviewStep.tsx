import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { Alert, DescriptionItem, DescriptionList, Surface } from '@/components/ds';
import { peopleSummary } from '../lib/mapping';
import type { ImportPreview, MappingDraft } from '../types';
import { currentLocale } from '@/i18n/format';

const noun = (key: string, n: number) => i18n.t(`admin:import.n.${key}`, { count: n, n: n.toLocaleString(currentLocale()) });

interface ReviewStepProps {
  preview: ImportPreview;
  draft: MappingDraft;
}

/** Step 4: the numbers and the first rows exactly as they will be created. */
export const ReviewStep = ({ preview, draft }: ReviewStepProps) => {
  const { t } = useTranslation('admin');
  const stageName = (key: string | undefined) => preview.stages.find(stage => stage.key === key)?.name ?? '';
  const memberName = (id: string | null | undefined) => preview.members.find(member => member.id === id)?.name ?? '';
  const people = peopleSummary(preview, draft);
  const project = draft.mode === 'existing' ? draft.existingProject : t('import.review.newSuffix', { name: draft.newName.trim() });

  const typeOf = (raw: string) => t(`tasks:type.${draft.typeMap[raw] ?? 'task'}`);
  const assigneesOf = (identifiers: string[]) =>
    identifiers.map(identifier => memberName(draft.userMap[identifier])).filter(Boolean).join(t('import.review.listSep')) || t('import.map.unassigned');

  const overLimit = preview.total > preview.limit;

  return (
    <div className="space-y-4">
      {overLimit && (
        <Alert tone="error" title={t('import.review.tooMany')}>
          {t('import.review.tooManyBody', { limit: preview.limit.toLocaleString(currentLocale()), total: preview.total.toLocaleString(currentLocale()) })}
        </Alert>
      )}

      <Surface as="section" aria-labelledby="import-summary" padding="sm" className="shadow-none">
        <h2 id="import-summary" className="mb-3 text-sm font-semibold text-text-strong">{t('import.review.ready')}</h2>
        <DescriptionList columns={2}>
          <DescriptionItem label={t('import.review.project')}>{project}</DescriptionItem>
          <DescriptionItem label={t('import.review.toCreate')}>
            <span className="font-semibold tabular-nums text-text-strong">{preview.total.toLocaleString(currentLocale())}</span>
            {preview.skipped > 0 && <span className="text-text-subtle">{t('import.review.leftOut', { rows: noun('row', preview.skipped) })}</span>}
          </DescriptionItem>
          <DescriptionItem label={t('import.review.statuses')}>{t('import.review.mapped', { count: noun('status', preview.statuses.length) })}</DescriptionItem>
          <DescriptionItem label={t('import.review.people')}>
            {preview.people.length === 0 ? t('import.review.noAssignees') : t('import.review.peopleSummary', { mapped: people.mapped, unassigned: people.unassigned })}
          </DescriptionItem>
          <DescriptionItem label={t('import.review.links')}>
            {noun('subtask', preview.withParent)}{t('import.review.listSep')}{noun('epicLink', preview.withEpic)}
          </DescriptionItem>
          <DescriptionItem label={t('import.review.extras')}>
            {[
              draft.createSprints && preview.sprints.length > 0 ? noun('sprint', preview.sprints.length) : null,
              draft.includeComments && preview.comments > 0 ? noun('comment', preview.comments) : null,
              preview.labels.length > 0 ? noun('label', preview.labels.length) : null,
            ].filter(Boolean).join(t('import.review.listSep')) || t('import.review.none')}
          </DescriptionItem>
        </DescriptionList>
      </Surface>

      {preview.warnings.length > 0 && (
        <Alert tone="warning" title={t('import.review.warnings', { count: preview.warnings.length })}>
          <ul className="list-disc space-y-0.5 ps-4">
            {preview.warnings.map(warning => <li key={warning}>{warning}</li>)}
          </ul>
        </Alert>
      )}

      <Surface as="section" padding="none" className="overflow-hidden shadow-none">
        <h2 id="import-rows" className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-text-strong">
          {t('import.review.first', { shown: Math.min(preview.items.length, 20), total: preview.total.toLocaleString(currentLocale()) })}
        </h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('import.review.rowsRegion')}>
          <table className="w-full min-w-[34rem] text-start text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-subtle">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">{t('import.review.title')}</th>
                <th scope="col" className="px-2 py-2 font-medium">{t('import.review.column')}</th>
                <th scope="col" className="px-2 py-2 font-medium">{t('import.review.type')}</th>
                <th scope="col" className="px-2 py-2 font-medium">{t('import.review.assignee')}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t('import.review.due')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.items.map(item => (
                <tr key={item.externalId}>
                  <td className="max-w-[16rem] px-4 py-2 text-text-strong">
                    <span className="block truncate" title={item.title}>{item.title}</span>
                    {(item.parentExternalId || item.epicExternalId) && (
                      <span className="block text-xs text-text-subtle">
                        {item.parentExternalId ? t('import.review.subtaskOf', { id: item.parentExternalId }) : t('import.review.inEpic', { id: item.epicExternalId })}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-text-body">{stageName(draft.statusMap[item.status]) || item.status}</td>
                  <td className="px-2 py-2 text-text-body">{typeOf(item.type)}</td>
                  <td className="max-w-[10rem] px-2 py-2 text-text-body"><span className="block truncate">{assigneesOf(item.assignees)}</span></td>
                  <td className="px-4 py-2 tabular-nums text-text-body">{item.dueDate ?? t('import.review.today')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
      <p className="text-xs text-text-subtle">
        {t('import.review.note')}
      </p>
    </div>
  );
};
