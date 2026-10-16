import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tag } from '@/components/ds';
import { RELEASE_STATUS_META } from '../lib/progress';
import type { Release } from '../types';

interface ReleaseStatusTagProps {
  release: Pick<Release, 'status' | 'progress'>;
  size?: 'sm' | 'md';
}

/** Status of a release, plus a warning tag (icon and word, never color alone) while it is overdue. */
const ReleaseStatusTag = ({ release, size = 'sm' }: ReleaseStatusTagProps) => {
  const { t } = useTranslation('projects');
  const meta = RELEASE_STATUS_META[release.status];
  return (
    <>
      <Tag tone={meta.tone} size={size}>{t(`releases.status.${release.status}`)}</Tag>
      {release.progress.overdue && (
        <Tag tone="warning" size={size}>
          <AlertTriangle aria-hidden className="size-3" />
          {t('releases.overdue')}
        </Tag>
      )}
    </>
  );
};

export default ReleaseStatusTag;
