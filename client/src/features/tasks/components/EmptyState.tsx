import type { ReactNode } from 'react';
import { CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const EmptyState = ({ title, description, icon, action, className }: EmptyStateProps) => (
  <div className={cn('py-20 text-center', className)}>
    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 [&_svg]:size-8">
      {icon ?? <CheckSquare />}
    </div>
    <h3 className="mb-1 text-lg font-semibold text-slate-700">{title}</h3>
    <p className="text-sm text-slate-500">{description}</p>
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);

export default EmptyState;
