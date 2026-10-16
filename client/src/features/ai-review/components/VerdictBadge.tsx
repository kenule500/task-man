import { CircleAlert, CircleCheck, CircleX, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tag } from '@/components/ds';
import { VERDICT_TONE } from '../lib/review';
import type { AiVerdict } from '../types';

const ICONS: Record<AiVerdict, LucideIcon> = { match: CircleCheck, partial: CircleAlert, mismatch: CircleX };

/** Match (success), Partial (warning) or Mismatch (danger): always an icon and a word, never color alone. */
const VerdictBadge = ({ verdict, size = 'md' }: { verdict: AiVerdict; size?: 'sm' | 'md' }) => {
  const { t } = useTranslation('ai');
  const Icon = ICONS[verdict];
  return (
    <Tag tone={VERDICT_TONE[verdict]} size={size} data-verdict={verdict}>
      <Icon className="size-3.5" aria-hidden />
      {t(`verdict.${verdict}`)}
    </Tag>
  );
};

export default VerdictBadge;
