import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/ds';
import { describeRange } from '../lib/format';
import type { AuditEntry } from '../types';

interface AuditPaginationProps {
  entries: AuditEntry[];
  hasNewer: boolean;
  hasOlder: boolean;
  onNewer: () => void;
  onOlder: () => void;
}

/** Cursor pagination: "Older" follows `nextBefore`, "Newer" walks back through the cursors already used. */
export const AuditPagination = ({ entries, hasNewer, hasOlder, onNewer, onOlder }: AuditPaginationProps) => {
  const { t } = useTranslation('settings');
  return (
    <Pagination
      compact
      label={t('audit.pagination.label')}
      summary={entries.length > 0 ? t('audit.pagination.showing', { range: describeRange(entries) }) : t('audit.pagination.none')}
      previousLabel={t('audit.pagination.newer')}
      nextLabel={t('audit.pagination.older')}
      hasPrevious={hasNewer}
      hasNext={hasOlder}
      onPrevious={onNewer}
      onNext={onOlder}
    />
  );
};
