import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  label: string;
  /** Omit on the current page (last item). */
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Accessible name of the landmark. */
  label?: string;
  /** Render a router link instead of a plain anchor (ds has no routing). */
  renderLink?: (item: BreadcrumbItem & { href: string }, className: string) => ReactNode;
  className?: string;
}

const CRUMB_LINK = 'rounded-sm text-text-subtle outline-none hover:text-text-strong hover:underline focus-visible:outline-2 focus-visible:outline-focus';

/** Path to the current page. The last item is plain text with `aria-current="page"`. */
export const Breadcrumbs = ({ items, label = 'Breadcrumb', renderLink, className }: BreadcrumbsProps) => (
  <nav aria-label={label} className={className}>
    <ol className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {isLast || !item.href ? (
              <span aria-current={isLast ? 'page' : undefined} className="truncate font-medium text-text-strong">{item.label}</span>
            ) : renderLink ? (
              renderLink({ ...item, href: item.href }, CRUMB_LINK)
            ) : (
              <a href={item.href} className={CRUMB_LINK}>{item.label}</a>
            )}
            {!isLast && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-text-faint" />}
          </li>
        );
      })}
    </ol>
  </nav>
);

// ---------------------------------------------------------------------------
// Disclosure and Accordion
// ---------------------------------------------------------------------------

interface DisclosureProps {
  title: ReactNode;
  children: ReactNode;
  /** Uncontrolled initial state. */
  defaultOpen?: boolean;
  /** Controlled state (pair with `onOpenChange`). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Heading level of the title row, so the outline stays correct. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/** One expandable region: a button (`aria-expanded`, `aria-controls`) that shows a panel. */
export const Disclosure = ({ title, children, defaultOpen = false, open, onOpenChange, headingLevel = 3, className }: DisclosureProps) => {
  const [inner, setInner] = useState(defaultOpen);
  const id = useId();
  const expanded = open ?? inner;
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const toggle = () => {
    if (open === undefined) setInner(!expanded);
    onOpenChange?.(!expanded);
  };
  return (
    <div className={cn('border-b border-border last:border-b-0', className)}>
      <Heading className="text-sm font-semibold text-text-strong">
        <button
          type="button"
          id={`${id}-button`}
          aria-expanded={expanded}
          aria-controls={`${id}-panel`}
          onClick={toggle}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md py-3 text-left outline-none hover:text-primary focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span>{title}</span>
          <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-text-subtle transition-transform duration-(--duration-base) ease-standard', expanded && 'rotate-180')} />
        </button>
      </Heading>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-button`} hidden={!expanded} className="pb-4 text-sm text-text-body">
        {children}
      </div>
    </div>
  );
};

export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  /** `single` closes the others when one opens. */
  type?: 'single' | 'multiple';
  defaultOpenIds?: string[];
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/** Stack of disclosures (FAQ, settings groups). */
export const Accordion = ({ items, type = 'single', defaultOpenIds = [], headingLevel = 3, className }: AccordionProps) => {
  const [openIds, setOpenIds] = useState<string[]>(defaultOpenIds);
  const toggle = (id: string, open: boolean) =>
    setOpenIds(current => {
      if (!open) return current.filter(item => item !== id);
      return type === 'single' ? [id] : [...current, id];
    });
  return (
    <div className={cn('rounded-xl border border-border bg-white px-4', className)}>
      {items.map(item => (
        <Disclosure
          key={item.id}
          title={item.title}
          headingLevel={headingLevel}
          open={openIds.includes(item.id)}
          onOpenChange={open => toggle(item.id, open)}
        >
          {item.content}
        </Disclosure>
      ))}
    </div>
  );
};
