import { CheckCircle2, FileText, FolderKanban, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconTile, Surface, Tag } from '@/components/ds';
import { formatNumber } from '@/i18n/format';
import { colorStyleOf } from '@/features/projects/lib/appearance';
import { cleanKey, isValidKey, PLAN_LIMITS, totals } from '../lib/plan';
import { formatFileSize } from '../lib/file';
import type { PlanContent, PlanDestination, PlanSource, PlanTarget } from '../types';
import type { PlanActions } from './actions';
import { EditableText } from './EditableText';

interface PlanHeaderProps {
  plan: PlanContent;
  source: PlanSource;
  actions: PlanActions;
  /** Existing targets get a read-only summary instead of the project fields. */
  destination?: PlanDestination;
  target?: PlanTarget | null;
  /** The target was deleted or archived after upload. */
  targetProblem?: string;
  /** The server refused the project name or key (already used). */
  nameProblem?: string;
  keyProblem?: string;
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg bg-surface-sunken px-3 py-2">
    <dt className="text-xs text-text-subtle">{label}</dt>
    <dd className="text-lg font-semibold tabular-nums text-text-strong">{formatNumber(value)}</dd>
  </div>
);

/** The generated project at a glance: name, key, description and totals, all editable in place. */
export const PlanHeader = ({ plan, source, actions, destination = 'new', target = null, targetProblem, nameProblem, keyProblem }: PlanHeaderProps) => {
  const { t } = useTranslation('aiPlan');
  const counts = totals(plan);
  const keyInvalid = !isValidKey(plan.project.key);
  const swatch = colorStyleOf(plan.project.color).swatch;

  if (destination === 'existing') {
    return (
      <Surface as="section" aria-label={t('header.label')} padding="md" className="space-y-4">
        <div className="flex items-start gap-3">
          <IconTile tone="primary" size="md"><FolderKanban className="size-5" /></IconTile>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">{t('header.addingTo')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 text-lg font-semibold text-text-strong sm:flex-none sm:text-xl">
                {target?.name ?? t('header.unknownTarget')}
              </h2>
              {target && <Tag tone="neutral"><span className="font-mono">{target.key}</span></Tag>}
            </div>
            <p className="text-sm text-text-body">{t('header.existingHint')}</p>
          </div>
        </div>
        {targetProblem && <p role="alert" className="text-sm font-medium text-danger-fg">{targetProblem}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-text-subtle">
            <FileText aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{t('header.source', { name: source.fileName, size: formatFileSize(source.size) })}</span>
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label={t('header.stats.sprints')} value={counts.sprints} />
          <Stat label={t('header.stats.tasks')} value={counts.items} />
          <Stat label={t('header.stats.subtasks')} value={counts.subtasks} />
          <Stat label={t('header.stats.criteria')} value={counts.criteria} />
          <Stat label={t('header.stats.points')} value={counts.points} />
        </dl>
      </Surface>
    );
  }

  return (
    <Surface as="section" aria-label={t('header.label')} padding="md" className="space-y-4">
      <div className="flex items-start gap-3">
        <IconTile tone="primary" size="md"><Sparkles className="size-5" /></IconTile>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 text-lg font-semibold text-text-strong sm:flex-none sm:text-xl">
              <EditableText
                value={plan.project.name}
                label={t('header.nameLabel')}
                maxLength={PLAN_LIMITS.projectName}
                required
                onSave={name => actions.updateProject({ name })}
              />
            </h2>
            <Tag tone="success"><CheckCircle2 aria-hidden className="size-3.5" /> {t('header.ready')}</Tag>
            <span aria-hidden className={`size-3 rounded-full ${swatch}`} />
          </div>
          {nameProblem && <p role="alert" className="text-xs font-medium text-danger-fg">{nameProblem}</p>}
          <EditableText
            multiline
            value={plan.project.description}
            label={t('header.descriptionLabel')}
            maxLength={PLAN_LIMITS.projectDescription}
            placeholder={t('header.noDescription')}
            onSave={description => actions.updateProject({ description })}
            className="text-sm text-text-body"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2 text-text-subtle">
          {t('header.key')}
          <span className="w-24">
            <EditableText
              value={plan.project.key}
              label={t('header.keyLabel')}
              maxLength={6}
              required
              onSave={value => actions.updateProject({ key: cleanKey(value) })}
              className="font-mono text-sm font-semibold text-text-strong"
            />
          </span>
        </span>
        {(keyInvalid || keyProblem) && (
          <span role="alert" className="text-xs font-medium text-danger-fg">{keyProblem ?? t('header.keyInvalid')}</span>
        )}
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-text-subtle">
          <FileText aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{t('header.source', { name: source.fileName, size: formatFileSize(source.size) })}</span>
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label={t('header.stats.sprints')} value={counts.sprints} />
        <Stat label={t('header.stats.tasks')} value={counts.items} />
        <Stat label={t('header.stats.subtasks')} value={counts.subtasks} />
        <Stat label={t('header.stats.criteria')} value={counts.criteria} />
        <Stat label={t('header.stats.points')} value={counts.points} />
      </dl>
    </Surface>
  );
};
