import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, DotsLoader, Spinner, Surface } from '@/components/ds';
import { Button, buttonVariants } from '@/components/ui/button';
import type { ImportResult } from '../types';
import { currentLocale } from '@/i18n/format';

interface ResultStepProps {
  slug: string;
  total: number;
  importing: boolean;
  error: string;
  result: ImportResult | null;
  onBack: () => void;
  onAnother: () => void;
}

/** Step 5: the request is running, then either the result with a link to the board or the reason it failed. */
export const ResultStep = ({ slug, total, importing, error, result, onBack, onAnother }: ResultStepProps) => {
  const { t } = useTranslation('admin');
  if (importing) {
    return (
      <Surface padding="lg" className="flex flex-col items-center gap-3 text-center shadow-none" aria-busy="true">
        <Spinner size="lg" label={t('import.result.importing')} />
        <p className="text-sm font-medium text-text-strong">{t('import.result.creating', { count: total, n: total.toLocaleString(currentLocale()) })}</p>
        <p className="text-xs text-text-subtle">{t('import.result.keepOpen')}</p>
        <DotsLoader label={t('import.result.working')} />
      </Surface>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title={t('import.result.nothingImported')}>{error}</Alert>
        <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={onBack}>{t('import.result.backToReview')}</Button>
      </div>
    );
  }

  if (!result) return null;
  const board = `/${slug}/tasks?view=board&project=${encodeURIComponent(result.project.name)}`;
  return (
    <div className="space-y-4">
      <Surface padding="lg" className="flex flex-col items-center gap-2 text-center shadow-none" role="status">
        <CheckCircle2 aria-hidden className="size-10 text-success-fg" />
        <h2 className="text-lg font-semibold text-text-strong">
          {t('import.result.imported', { count: result.created, n: result.created.toLocaleString(currentLocale()), project: result.project.name })}
        </h2>
        <p className="text-sm text-text-body tabular-nums">
          {result.skipped > 0 ? t('import.result.leftOut', { n: result.skipped.toLocaleString(currentLocale()) }) : ''}
          {result.sprintsCreated > 0 ? t('import.result.sprintsCreated', { count: result.sprintsCreated }) : ''}
        </p>
      </Surface>

      {result.warnings.length > 0 && (
        <Alert tone="warning" title={t('import.result.worthALook')}>
          <ul className="list-disc space-y-0.5 ps-4">
            {result.warnings.map(warning => <li key={warning}>{warning}</li>)}
          </ul>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to={board} className={buttonVariants({ className: 'h-11 sm:h-9' })}>{t('import.result.openBoard')}</Link>
        <Link to={`/${slug}/projects/${result.project._id}`} className={buttonVariants({ variant: 'outline', className: 'h-11 sm:h-9' })}>
          {t('import.result.openProject')}
        </Link>
        <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={onAnother}>{t('import.result.another')}</Button>
      </div>
    </div>
  );
};
