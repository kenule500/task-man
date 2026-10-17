import { useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Link2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as ds from '@/components/ds';
import { Surface, Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { buildImportStatement } from './importStatement';
import { PreviewArea } from './preview';

// Documentation kit: the building blocks every section of the style guide is made of.

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

interface DocSectionProps {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Deep link to a heading. It sits next to the heading (not inside it) so the heading keeps a clean accessible name.
 * Reachable with Tab; the browser updates the hash and the page scrolls to the target.
 */
export const HeadingAnchor = ({ id, label }: { id: string; label: string }) => (
  <a
    href={`#${id}`}
    aria-label={`Link to ${label}`}
    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-subtle outline-none hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-2 focus-visible:outline-focus"
  >
    <Link2 aria-hidden className="size-4" />
  </a>
);

/**
 * A navigable section of the guide: an `h3` under its group's `h2`. The id is the anchor and the scrollspy target.
 * Sub-headings inside are `h4` (SubHeading); headings inside live examples are `h5` or lower and sit in a `[data-demo]` area.
 */
export const DocSection = ({ id, title, description, children, className }: DocSectionProps) => (
  <section id={id} aria-labelledby={`${id}-title`} data-doc-section className={cn('scroll-mt-24 space-y-5', className)}>
    <div className="max-w-3xl">
      <div className="flex items-center gap-1">
        <h3 id={`${id}-title`} className="text-xl font-bold tracking-tight text-text-strong">{title}</h3>
        <HeadingAnchor id={id} label={title} />
      </div>
      {description && <p className="mt-1 text-sm text-text-subtle">{description}</p>}
    </div>
    {children}
  </section>
);

/** Heading inside a section (h4). Listed in the "On this page" rail on wide screens. */
export const SubHeading = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h4 className={cn('text-xs font-semibold uppercase tracking-wider text-text-subtle', className)}>{children}</h4>
);

/** Labelled live example on a white card. The example itself is a preview area: it follows the guide's language and direction. */
export const Specimen = ({ label, children, className, bare }: { label: string; children: ReactNode; className?: string; bare?: boolean }) => (
  <Surface padding="sm" className={cn('min-w-0 space-y-3', className)}>
    <SubHeading>{label}</SubHeading>
    <PreviewArea className={bare ? undefined : 'flex flex-wrap items-center gap-3'}>{children}</PreviewArea>
  </Surface>
);

export const Prose = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('max-w-3xl space-y-3 text-sm leading-6 text-text-body [&_code]:rounded [&_code]:bg-surface-sunken [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:ps-5', className)}>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

interface DataTableProps {
  caption: string;
  columns: string[];
  rows: ReactNode[][];
  className?: string;
}

/** Plain table that scrolls inside its own box on narrow screens. */
export const DataTable = ({ caption, columns, rows, className }: DataTableProps) => (
  // Focusable so keyboard users can scroll the table sideways
  <div tabIndex={0} role="region" aria-label={caption} className={cn('overflow-x-auto rounded-xl border border-border bg-white outline-none focus-visible:outline-2 focus-visible:outline-focus', className)}>
    <table className="w-full min-w-[32rem] text-start text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="bg-surface-sunken text-xs font-semibold uppercase tracking-wider text-text-subtle">
        <tr>
          {columns.map(column => <th key={column} scope="col" className="px-4 py-2.5">{column}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle text-text-body">
        {rows.map((row, index) => (
          <tr key={index} className="align-top">
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className={cn('px-4 py-2.5', cellIndex === 0 && 'font-medium text-text-strong')}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export interface PropRow {
  name: string;
  type: string;
  default?: string;
  description: string;
}

export const PropsTable = ({ rows, caption }: { rows: PropRow[]; caption: string }) => (
  <DataTable
    caption={caption}
    columns={['Prop', 'Type', 'Default', 'Description']}
    rows={rows.map(row => [
      <code key="n" data-prop-name="" className="font-mono text-xs">{row.name}</code>,
      <code key="t" className="font-mono text-xs text-text-subtle">{row.type}</code>,
      <span key="d" className="font-mono text-xs text-text-subtle">{row.default ?? '—'}</span>,
      row.description,
    ])}
  />
);

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

/** Clipboard access is optional: without it nothing happens and the text stays selectable. */
const useCopy = (text: string) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const copy = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return { copied, copy };
};

/** Copyable snippet. Clipboard access is optional: the text stays selectable without it. */
export const CodeBlock = ({ code, label = 'Code' }: { code: string; label?: string }) => {
  const { copied, copy } = useCopy(code);

  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-inverse-border bg-inverse">
      <div className="flex items-center justify-between gap-2 border-b border-inverse-border px-3 py-1.5">
        <span className="text-xs font-medium text-inverse-muted">{label}</span>
        <Button type="button" variant="ghost" size="sm" onClick={copy} className="text-inverse-muted hover:bg-inverse-border hover:text-inverse-text">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
          <span className="sr-only"> {label.toLowerCase()} to clipboard</span>
        </Button>
      </div>
      <pre tabIndex={0} className="overflow-x-auto p-4 text-xs leading-5 text-inverse-text outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"><code>{code}</code></pre>
      <span role="status" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Do / Don't
// ---------------------------------------------------------------------------

export const DoDont = ({ doText, dontText }: { doText: ReactNode; dontText: ReactNode }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <div className="rounded-xl border border-success-border bg-success-bg p-3.5">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-success-fg"><ThumbsUp aria-hidden className="size-4" />Do</p>
      <p className="text-sm text-success-fg">{doText}</p>
    </div>
    <div className="rounded-xl border border-danger-border bg-danger-bg p-3.5">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-danger-fg"><ThumbsDown aria-hidden className="size-4" />Don&apos;t</p>
      <p className="text-sm text-danger-fg">{dontText}</p>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Component documentation template
// ---------------------------------------------------------------------------

export interface StateExample {
  label: string;
  node: ReactNode;
}

interface ComponentDocProps {
  /** Anchor id, `c-<slug>` by convention. */
  id: string;
  name: string;
  /** Where it lives, e.g. `@/components/ds` */
  source: string;
  maturity: 'stable' | 'beta';
  purpose: ReactNode;
  anatomy: string[];
  variants: ReactNode;
  /** Interactive/visual states; omit for purely static components. */
  states?: StateExample[];
  a11y: string[];
  doText: ReactNode;
  dontText: ReactNode;
  code: string;
  props: PropRow[];
  /** Overrides the generated import statement of the "Copy import" button. */
  importStatement?: string;
}

const DS_EXPORTS = Object.keys(ds);

/** "Copy import" button of a component page: the import statement, ready to paste. */
const CopyImportButton = ({ name, statement }: { name: string; statement: string }) => {
  const { copied, copy } = useCopy(statement);
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} data-import={statement}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span>{copied ? 'Copied' : 'Copy import'}</span>
      <span className="sr-only"> statement for {name}</span>
    </Button>
  );
};

/**
 * The per-component template: Purpose, Anatomy, Variants (live), States,
 * Accessibility, Do/Don't, Code, Props. Every component page in the guide uses it.
 */
export const ComponentDoc = ({
  id, name, source, maturity, purpose, anatomy, variants, states, a11y, doText, dontText, code, props, importStatement,
}: ComponentDocProps) => (
  <section id={id} aria-labelledby={`${id}-title`} data-doc-section className="scroll-mt-24">
    <Surface padding="none" className="min-w-0 overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h3 id={`${id}-title`} className="text-lg font-bold tracking-tight text-text-strong">{name}</h3>
            <HeadingAnchor id={id} label={name} />
          </div>
          <p className="mt-0.5 break-words font-mono text-xs text-text-subtle">{source}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyImportButton name={name} statement={importStatement ?? buildImportStatement(name, source, code, DS_EXPORTS)} />
          <Tag tone={maturity === 'stable' ? 'success' : 'warning'} aria-label={`Maturity: ${maturity}`}>{maturity}</Tag>
        </div>
      </header>

      <div className="space-y-6 px-5 py-5">
        <div className="space-y-2">
          <SubHeading>Purpose</SubHeading>
          <p className="max-w-3xl text-sm text-text-body">{purpose}</p>
        </div>

        <div className="space-y-2">
          <SubHeading>Anatomy</SubHeading>
          <ol className="flex flex-wrap gap-2 text-xs">
            {anatomy.map((part, index) => (
              <li key={part} className="flex items-center gap-1.5 rounded-md border border-border bg-surface-sunken px-2 py-1 text-text-body">
                <span aria-hidden className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">{index + 1}</span>
                {part}
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-2">
          <SubHeading>Variants</SubHeading>
          <div className="min-w-0 rounded-xl border border-border-subtle bg-canvas p-4">
            <PreviewArea className="flex flex-wrap items-center gap-3">{variants}</PreviewArea>
          </div>
        </div>

        <div className="space-y-2">
          <SubHeading>States</SubHeading>
          {states && states.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {states.map(state => (
                <div key={state.label} className="min-w-0 rounded-xl border border-border-subtle bg-canvas p-3">
                  <p className="mb-2 text-xs font-medium text-text-subtle">{state.label}</p>
                  <PreviewArea className="flex flex-wrap items-center gap-2">{state.node}</PreviewArea>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-subtle">Display only: it has no interactive states of its own.</p>
          )}
        </div>

        <div className="space-y-2">
          <SubHeading>Accessibility</SubHeading>
          <ul className="max-w-3xl list-disc space-y-1 ps-5 text-sm text-text-body">
            {a11y.map(note => <li key={note}>{note}</li>)}
          </ul>
        </div>

        <div className="space-y-2">
          <SubHeading>Do and don&apos;t</SubHeading>
          <DoDont doText={doText} dontText={dontText} />
        </div>

        <div className="space-y-2">
          <SubHeading>Code</SubHeading>
          <CodeBlock code={code} label={`${name} example`} />
        </div>

        <div className="space-y-2">
          <SubHeading>Props</SubHeading>
          <PropsTable rows={props} caption={`${name} props`} />
        </div>
      </div>
    </Surface>
  </section>
);
