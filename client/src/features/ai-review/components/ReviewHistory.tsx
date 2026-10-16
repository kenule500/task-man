import { useTranslation } from 'react-i18next';
import { Tag } from '@/components/ds';
import { formatDateTimeIn } from '@/i18n/format';
import { cn } from '@/lib/utils';
import { isActive, prLabel } from '../lib/review';
import type { AiReview } from '../types';
import VerdictBadge from './VerdictBadge';

interface ReviewHistoryProps {
  reviews: AiReview[];
  shownId: string | null;
  onSelect: (id: string) => void;
}

const when = (review: AiReview): string =>
  formatDateTimeIn(new Date(review.completedAt ?? review.createdAt), { dateStyle: 'medium', timeStyle: 'short' });

/** Previous runs of this task, newest first; picking one shows its result above. */
const ReviewHistory = ({ reviews, shownId, onSelect }: ReviewHistoryProps) => {
  const { t } = useTranslation('ai');
  if (reviews.length < 2) return null;
  return (
    <section aria-label={t('panel.history.title')}>
      <h4 className="mb-1 text-xs font-medium text-slate-600">{t('panel.history.title')}</h4>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {reviews.map(review => {
          const current = review._id === shownId;
          return (
            <li key={review._id}>
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelect(review._id)}
                className={cn(
                  'flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-primary sm:min-h-9',
                  current ? 'bg-slate-50' : 'hover:bg-slate-50',
                )}
              >
                {review.status === 'completed' && review.verdict ? (
                  <VerdictBadge verdict={review.verdict} size="sm" />
                ) : (
                  <Tag tone={review.status === 'failed' ? 'danger' : 'primary'} size="sm">{t(`status.${review.status}`)}</Tag>
                )}
                <span className="min-w-0 flex-1 text-slate-800">
                  {review.status === 'failed'
                    ? t('panel.history.itemFailed', { date: when(review) })
                    : isActive(review)
                      ? t('panel.history.itemRunning', { date: when(review) })
                      : when(review)}
                </span>
                <span dir="ltr" className="text-xs text-slate-600">{prLabel(review.pr)}</span>
                <span className="text-xs text-slate-600">
                  {current ? t('panel.history.showing') : t('panel.history.show')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ReviewHistory;
