import { SkeletonList } from '@/components/ds';
import { t } from '@/i18n';

/** Placeholder rows while the audit log loads; same shape as real rows so the layout does not jump. */
export const AuditSkeleton = ({ rows = 8 }: { rows?: number }) => (
  <SkeletonList rows={rows} trailing={false} label={t('settings:audit.loading')} />
);
