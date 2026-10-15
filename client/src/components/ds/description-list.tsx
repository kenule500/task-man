import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { descriptionListVariants, type DescriptionListVariants } from './variants';

type DescriptionListProps = Omit<ComponentProps<'dl'>, 'children'> & DescriptionListVariants & {
  children: ReactNode;
};

/**
 * Key/value block (a real `<dl>`): the details of a task, a project or a member.
 * `layout="stacked"` puts the label above the value (default, best in narrow panels); `inline` aligns labels in a column.
 */
export const DescriptionList = ({ layout, columns, className, ...props }: DescriptionListProps) => (
  <dl data-layout={layout ?? 'stacked'} className={cn(descriptionListVariants({ layout, columns }), className)} {...props} />
);

type DescriptionItemProps = {
  label: ReactNode;
  children: ReactNode;
  /** Span every column, e.g. for labels or a long description. */
  wide?: boolean;
  className?: string;
};

/**
 * One term/description pair. In the `inline` layout it renders as a grid row (`display: contents`) so the
 * labels line up; in `stacked` it is a small block. Empty values should say so ("None"), never leave a gap.
 */
export const DescriptionItem = ({ label, children, wide, className }: DescriptionItemProps) => (
  <div className={cn('min-w-0 in-data-[layout=inline]:contents', wide && 'col-span-full', className)}>
    <dt className="text-xs font-medium uppercase tracking-wide text-text-subtle">{label}</dt>
    <dd className="mt-1 min-w-0 break-words text-sm text-text-body in-data-[layout=inline]:mt-0">{children}</dd>
  </div>
);
