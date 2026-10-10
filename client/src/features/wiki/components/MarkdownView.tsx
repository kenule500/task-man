import { memo, useMemo, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { isExternalHref, isInternalHref, mentionLinks, remarkTaskKeys } from '../lib/mentions';
import type { WikiMention } from '../types';

type MarkdownProps = ComponentProps<typeof ReactMarkdown>;

const LINK = 'rounded-sm font-medium text-info-fg underline decoration-info-border underline-offset-2 outline-none hover:decoration-info-fg focus-visible:outline-2 focus-visible:outline-focus';

// Raw HTML in the source is never rendered (react-markdown escapes it); unsafe URL schemes are dropped by its default urlTransform.
const components: MarkdownProps['components'] = {
  a: ({ href = '', children, title }) => {
    if (isInternalHref(href)) {
      return <Link to={href} title={title} className={LINK}>{children}</Link>;
    }
    if (isExternalHref(href)) {
      return (
        <a href={href} title={title} target="_blank" rel="noopener noreferrer" className={LINK}>
          {children}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      );
    }
    return <a href={href} title={title} className={LINK}>{children}</a>;
  },
  // The page title is an h2, so content headings start at h3 (same look, valid outline for screen readers)
  h1: ({ children }) => <h3 className="mt-6 mb-3 text-2xl font-bold tracking-tight text-text-strong first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mt-6 mb-2 border-b border-slate-200 pb-1 text-xl font-semibold text-text-strong first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-5 mb-2 text-lg font-semibold text-text-strong first:mt-0">{children}</h5>,
  h4: ({ children }) => <h6 className="mt-4 mb-1.5 text-base font-semibold text-text-strong first:mt-0">{children}</h6>,
  h5: ({ children }) => <h6 className="mt-4 mb-1.5 text-sm font-semibold text-text-strong first:mt-0">{children}</h6>,
  h6: ({ children }) => <h6 className="mt-4 mb-1.5 text-sm font-semibold text-text-subtle first:mt-0">{children}</h6>,
  p: ({ children }) => <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={cn('my-3 space-y-1 pl-6', className?.includes('contains-task-list') ? 'list-none pl-1' : 'list-disc')}>{children}</ul>
  ),
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children, className }) => (
    <li className={cn('leading-7', className?.includes('task-list-item') && 'flex items-start gap-2')}>{children}</li>
  ),
  input: ({ checked, type }) => (type === 'checkbox'
    ? <input type="checkbox" checked={Boolean(checked)} disabled readOnly aria-label={checked ? 'Done' : 'Not done'} className="mt-2 size-4 shrink-0 accent-primary" />
    : null),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-border-strong bg-surface-sunken py-1 pl-4 text-text-body [&>p]:my-1">{children}</blockquote>
  ),
  hr: () => <hr className="my-6 border-slate-200" />,
  code: ({ children, className }) => (
    className?.startsWith('language-')
      ? <code className={cn('font-mono text-[0.85em]', className)}>{children}</code>
      : <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.85em] text-text-strong">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-slate-200 bg-surface-sunken p-3 text-sm leading-6 text-text-strong">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-sunken text-left text-text-strong">{children}</thead>,
  th: ({ children }) => <th className="border-b border-slate-200 px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-t border-slate-200 px-3 py-2 align-top">{children}</td>,
  // Remote images would tell other servers who reads the page, so an image shows as a link to it
  img: ({ src, alt }) => (src
    ? <a href={src} target="_blank" rel="noopener noreferrer" className={LINK}>{alt || 'Image'}<span className="sr-only"> (opens in a new tab)</span></a>
    : null),
};

interface MarkdownViewProps {
  source: string;
  workspaceSlug: string;
  /** Task keys of the page that exist; they become links that open the task. */
  mentions?: readonly WikiMention[];
  className?: string;
}

/** Renders Markdown (GitHub flavour) without raw HTML; external links open safely and task keys link to the task. */
const MarkdownView = memo(({ source, workspaceSlug, mentions = [], className }: MarkdownViewProps) => {
  const remarkPlugins = useMemo<MarkdownProps['remarkPlugins']>(
    () => [remarkGfm, [remarkTaskKeys, { links: mentionLinks(mentions, workspaceSlug) }]] as MarkdownProps['remarkPlugins'],
    [mentions, workspaceSlug],
  );
  return (
    <div className={cn('wiki-prose min-w-0 text-base break-words text-text-body', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>{source}</ReactMarkdown>
    </div>
  );
});
MarkdownView.displayName = 'MarkdownView';

export default MarkdownView;
