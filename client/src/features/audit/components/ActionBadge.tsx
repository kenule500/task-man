import { Tag } from '@/components/ds';
import { cn } from '@/lib/utils';
import { actionMeta } from '../lib/format';

/** Icon plus name of an action: the meaning never rests on color alone. */
export const ActionBadge = ({ action, className }: { action: string; className?: string }) => {
  const { label, icon: Icon, tone } = actionMeta(action);
  return (
    <Tag tone={tone} size="sm" className={cn('max-w-full', className)}>
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </Tag>
  );
};
