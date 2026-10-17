import { useId, useState } from 'react';
import { Bot, ChevronDown, CircleAlert, CircleCheck, CircleX, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tag, alertVariants } from '@/components/ds';
import { formatDateTimeIn, formatNumber } from '@/i18n/format';
import { cn } from '@/lib/utils';
import { CRITERION_TONE, SEVERITY_TONE, groupIssues, prLabel, totalCriteria } from '../lib/review';
import type { AiReview, CriterionStatus, ReviewCriterion } from '../types';
import VerdictBadge from './VerdictBadge';

const CRITERION_ICONS: Record<CriterionStatus, LucideIcon> = { met: CircleCheck, partial: CircleAlert, missing: CircleX };
const BANNER_TONE = { match: 'success', partial: 'warning', mismatch: 'error' } as const;
const NUMBER_TONE = { success: 'text-success-fg', warning: 'text-warning-fg', danger: 'text-danger-fg' } as const;

type HeadingTag = 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
/** The heading level for a base level plus an offset, between 2 and 6. */
const clampLevel = (level: number): number => Math.min(Math.max(level, 2), 6);

const formatTime = (iso: string): string =>
  formatDateTimeIn(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

// ----------------------------------------------------------------
// Counts
// ----------------------------------------------------------------
const Stat = ({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: keyof typeof NUMBER_TONE }) => (
  <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
    <dt className="text-xs font-medium text-slate-600">{label}</dt>
    <dd className="mt-0.5">
      <span className={cn('text-xl font-semibold tabular-nums', tone ? NUMBER_TONE[tone] : 'text-slate-900')}>{formatNumber(value)}</span>
      {hint && <span className="ms-1.5 text-xs text-slate-600">{hint}</span>}
    </dd>
  </div>
);

const Counts = ({ review }: { review: AiReview }) => {
  const { t } = useTranslation('ai');
  const { counts } = review;
  return (
    <dl className="grid grid-cols-3 gap-2" aria-label={t('result.title')}>
      <Stat
        label={t('result.stat.completed')}
        value={counts.met}
        hint={t('result.stat.ofTotal', { total: totalCriteria(counts) })}
        tone={counts.met > 0 && counts.met === totalCriteria(counts) ? 'success' : undefined}
      />
      <Stat label={t('result.stat.missing')} value={counts.missing} tone={counts.missing > 0 ? 'danger' : undefined} />
      <Stat label={t('result.stat.issues')} value={counts.issues} tone={counts.issues > 0 ? 'warning' : undefined} />
    </dl>
  );
};

// ----------------------------------------------------------------
// One criterion (expandable)
// ----------------------------------------------------------------
const CriterionRow = ({ criterion, headingLevel }: { criterion: ReviewCriterion; headingLevel: number }) => {
  const { t } = useTranslation('ai');
  const Sub = `h${clampLevel(headingLevel + 1)}` as HeadingTag;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Icon = CRITERION_ICONS[criterion.status];
  return (
    <li className="px-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(current => !current)}
        className="flex min-h-11 w-full items-start gap-2.5 rounded py-2.5 text-start focus-visible:outline-2 focus-visible:outline-primary sm:min-h-10"
      >
        <Tag tone={CRITERION_TONE[criterion.status]} size="sm" className="mt-0.5 shrink-0" data-status={criterion.status}>
          <Icon className="size-3" aria-hidden />
          {t(`result.criterion.${criterion.status}`)}
        </Tag>
        <span className="min-w-0 flex-1 text-sm text-slate-900 [overflow-wrap:anywhere]">{criterion.text}</span>
        <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} aria-hidden />
        <span className="sr-only">{open ? t('result.criterion.collapse') : t('result.criterion.expand')}</span>
      </button>
      {open && (
        <div id={panelId} className="space-y-3 pb-3 ps-1 text-sm text-slate-700">
          <div>
            <Sub className="mb-1 text-xs font-medium text-slate-600">{t('result.criterion.evidence')}</Sub>
            {criterion.evidence.length === 0 ? (
              <p className="text-slate-600">{t('result.criterion.noEvidence')}</p>
            ) : (
              <ul className="space-y-1.5">
                {criterion.evidence.map((item, index) => (
                  <li key={`${item.file}-${index}`} className="flex flex-col gap-0.5">
                    {item.file && (
                      <code dir="ltr" className="w-fit max-w-full truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800" title={item.file}>
                        {item.file}
                      </code>
                    )}
                    {item.note && <span className="[overflow-wrap:anywhere]">{item.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {criterion.explanation && (
            <div>
              <Sub className="mb-1 text-xs font-medium text-slate-600">{t('result.criterion.explanation')}</Sub>
              <p className="[overflow-wrap:anywhere]">{criterion.explanation}</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
};

// ----------------------------------------------------------------
// Issues
// ----------------------------------------------------------------
const Issues = ({ review, headingLevel }: { review: AiReview; headingLevel: number }) => {
  const { t } = useTranslation('ai');
  const Title = `h${clampLevel(headingLevel)}` as HeadingTag;
  const Sub = `h${clampLevel(headingLevel + 1)}` as HeadingTag;
  const groups = groupIssues(review.issues);
  return (
    <section aria-label={t('result.issues.title')}>
      <Title className="mb-2 text-sm font-semibold text-slate-900">{t('result.issues.title')}</Title>
      {groups.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-slate-600">
          <CircleCheck className="size-4 text-success-fg" aria-hidden /> {t('result.issues.none')}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <div key={group.severity}>
              <Sub className="mb-1 text-xs font-medium text-slate-600">
                {t('result.issues.group', { count: group.issues.length, severity: t(`result.issues.severity.${group.severity}`) })}
              </Sub>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {group.issues.map((issue, index) => (
                  <li key={`${issue.file}-${issue.line}-${index}`} className="space-y-1 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Tag tone={SEVERITY_TONE[issue.severity]} size="sm">{t(`result.issues.severity.${issue.severity}`)}</Tag>
                      <Tag size="sm">{t(`result.issues.category.${issue.category}`)}</Tag>
                      {issue.file && (
                        <code dir="ltr" className="max-w-full truncate font-mono text-xs text-slate-700" title={issue.file}>
                          {issue.file}{issue.line ? `:${issue.line}` : ''}
                        </code>
                      )}
                    </div>
                    <p className="text-sm text-slate-800 [overflow-wrap:anywhere]">{issue.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

// ----------------------------------------------------------------
// The finished review
// ----------------------------------------------------------------
const MAX_LISTED_FILES = 12;

/**
 * Verdict, counts, summary, per-criterion analysis, code issues, and a warning when the review is partial.
 * `headingLevel` is the level of its section headings (default 4, under the task dialog's h3); sub-headings go one lower.
 */
const ReviewResult = ({ review, headingLevel = 4 }: { review: AiReview; headingLevel?: number }) => {
  const { t } = useTranslation('ai');
  const Title = `h${clampLevel(headingLevel)}` as HeadingTag;
  const criteria = review.criteria ?? [];
  const omitted = review.omittedFiles.slice(0, MAX_LISTED_FILES);
  const moreOmitted = review.omittedFiles.length - omitted.length;
  const verdict = review.verdict;

  return (
    <div className="space-y-4" data-testid="review-result">
      <div className="flex flex-wrap items-center gap-2">
        {verdict && <VerdictBadge verdict={verdict} />}
        {verdict && <Title className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{t(`verdictHeadline.${verdict}`)}</Title>}
      </div>

      <Counts review={review} />
      {review.counts.partial > 0 && (
        <p className="-mt-2 text-xs text-slate-600">{t('result.stat.partly', { count: review.counts.partial })}</p>
      )}

      {review.truncated && (
        <div role="status" className={alertVariants({ tone: 'warning' })}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('result.partial.title')}</p>
            <p>{t('result.partial.body')}</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-5">
              {omitted.map(name => <li key={name} dir="ltr" className="font-mono text-xs [overflow-wrap:anywhere]">{name}</li>)}
            </ul>
            {moreOmitted > 0 && <p className="mt-1 text-xs">{t('result.partial.more', { count: moreOmitted })}</p>}
          </div>
        </div>
      )}

      {review.summary && verdict && (
        <section aria-label={t('result.summary')} className={cn(alertVariants({ tone: BANNER_TONE[verdict] }), 'items-start')}>
          <Bot className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{review.summary}</p>
        </section>
      )}

      {criteria.length > 0 && (
        <section aria-label={t('result.detailed')}>
          <Title className="mb-2 text-sm font-semibold text-slate-900">{t('result.detailed')}</Title>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {criteria.map((criterion, index) => <CriterionRow key={`${index}-${criterion.text}`} criterion={criterion} headingLevel={headingLevel} />)}
          </ul>
        </section>
      )}

      <Issues review={review} headingLevel={headingLevel} />

      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
        <span dir="ltr">{prLabel(review.pr)}</span>
        <span>{t('result.meta.model', { model: review.model })}</span>
        {review.completedAt && <span>{t('result.meta.reviewedAt', { date: formatTime(review.completedAt) })}</span>}
        <span>{review.requestedBy ? t('result.meta.requestedBy', { name: review.requestedBy.name }) : t('result.meta.automatic')}</span>
        {(review.usage.inputTokens > 0 || review.usage.outputTokens > 0) && (
          <span>{t('result.meta.tokens', { input: formatNumber(review.usage.inputTokens), output: formatNumber(review.usage.outputTokens) })}</span>
        )}
      </p>
    </div>
  );
};

export default ReviewResult;
