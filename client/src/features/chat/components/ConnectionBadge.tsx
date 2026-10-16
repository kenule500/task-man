import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ConnectionStatus } from '../types';

const DOT: Record<ConnectionStatus, string> = {
  connected: 'bg-success-dot',
  connecting: 'bg-warning-dot',
  offline: 'bg-warning-dot',
  idle: 'bg-slate-400',
};

/** Whether messages arrive live or by refreshing every few seconds. Words and a dot, never color alone. */
const ConnectionBadge = ({ status, className }: { status: ConnectionStatus; className?: string }) => {
  const { t } = useTranslation('chat');
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-slate-600', className)} title={t(`status.${status}Hint`)}>
      <span aria-hidden className={cn('size-2 rounded-full', DOT[status])} />
      {t(`status.${status}`)}
    </span>
  );
};

export default ConnectionBadge;
