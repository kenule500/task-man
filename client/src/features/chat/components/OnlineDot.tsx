import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** Small presence dot with a screen-reader word ("Online" / "Offline"). */
const OnlineDot = ({ online, className }: { online: boolean; className?: string }) => {
  const { t } = useTranslation('chat');
  return (
    <span className={cn('inline-block size-2.5 rounded-full border border-white', online ? 'bg-success-dot' : 'bg-slate-300', className)}>
      <span className="sr-only">{online ? t('presence.online') : t('presence.offline')}</span>
    </span>
  );
};

export default OnlineDot;
