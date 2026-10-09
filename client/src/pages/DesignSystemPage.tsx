import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { EmptyState, PageHeader, SearchInput, Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DOC_ENTRIES } from './design-system/registry';
import { filterEntries, groupEntries } from './design-system/search';
import { ALL_COLOR_TOKENS } from './design-system/tokens';
import { useScrollSpy } from './design-system/useScrollSpy';

// Living style guide: tokens, components and patterns in one documentation site.
// Public route (/design-system) so designers and reviewers can open it without an account.
// Content lives in ./design-system (sections/*, registry.ts, tokens.ts); add a section there.

const COMPONENT_COUNT = DOC_ENTRIES.filter(entry => entry.group === 'Components').length;

const scrollToSection = (id: string) => {
  document.getElementById(id)?.scrollIntoView?.({ block: 'start' });
  if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`);
};

const DesignSystemPage = () => {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const visible = useMemo(() => filterEntries(DOC_ENTRIES, deferredQuery), [deferredQuery]);
  const groups = useMemo(() => groupEntries(visible), [visible]);
  const ids = useMemo(() => visible.map(entry => entry.id), [visible]);
  const [active, setActive] = useScrollSpy(ids);

  // Open the section named in the URL hash (shared links)
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView?.({ block: 'start' });
  }, []);

  const jump = (id: string) => {
    setActive(id);
    scrollToSection(id);
  };

  return (
    <div className="min-h-screen bg-canvas text-text-body">
      <a
        href="#main"
        className="sr-only z-(--z-tooltip) rounded-lg bg-white px-4 py-2 text-sm font-medium text-text-strong shadow-floating focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:outline-2 focus-visible:outline-focus"
      >
        Skip to content
      </a>

      <header className="z-(--z-sticky) border-b border-border bg-white/95 backdrop-blur lg:sticky lg:top-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-text-strong lg:flex-none lg:basis-60">
            <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">T</span>
            <span className="truncate">TaskMan design system</span>
          </p>
          <Link
            to="/"
            className="order-2 inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-text-body outline-none hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus lg:order-3 lg:h-9"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to app
          </Link>
          <div className="order-3 w-full lg:order-2 lg:max-w-md lg:flex-1" role="search">
            <SearchInput label="Search sections and components" placeholder="Search sections and components" value={query} onValueChange={setQuery} />
          </div>
        </div>
      </header>

      {/* Phones and tablets: sections in a select instead of the side navigation */}
      <div className="sticky top-0 z-(--z-sticky) border-b border-border bg-white/95 px-4 py-2 backdrop-blur sm:px-6 lg:hidden">
        <label htmlFor="ds-jump" className="sr-only">Jump to section</label>
        <select
          id="ds-jump"
          value={active}
          onChange={event => jump(event.target.value)}
          disabled={visible.length === 0}
          className="h-11 w-full rounded-lg border border-border-strong bg-white px-3 text-base text-text-strong outline-none focus-visible:outline-2 focus-visible:outline-focus sm:text-sm"
        >
          {groups.map(({ group, entries }) => (
            <optgroup key={group} label={group}>
              {entries.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="mx-auto max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-10">
        <aside className="hidden lg:block">
          <nav aria-label="Sections" className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 pb-4">
            {groups.length === 0 ? (
              <p className="px-2 text-sm text-text-subtle">No matching sections.</p>
            ) : (
              groups.map(({ group, entries }) => (
                <Fragment key={group}>
                  <p id={`nav-${group}`} className="mt-4 mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-text-subtle first:mt-0">{group}</p>
                  <ul aria-labelledby={`nav-${group}`} className="space-y-0.5">
                    {entries.map(entry => (
                      <li key={entry.id}>
                        <a
                          href={`#${entry.id}`}
                          aria-current={entry.id === active ? 'location' : undefined}
                          onClick={() => setActive(entry.id)}
                          className={cn(
                            'block rounded-md px-2 py-1.5 text-sm outline-none transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-focus',
                            entry.id === active
                              ? 'bg-primary/10 font-medium text-primary'
                              : 'text-text-body hover:bg-surface-sunken hover:text-text-strong',
                          )}
                        >
                          {entry.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Fragment>
              ))
            )}
          </nav>
        </aside>

        <main id="main" tabIndex={-1} className="min-w-0 space-y-12 outline-none">
          <div className="space-y-4">
            <PageHeader
              title="TaskMan design system"
              description="Tokens, components and patterns shared by every screen. Rules live in DESIGN.md."
            />
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="primary">v2.0</Tag>
              <Tag tone="neutral">{COMPONENT_COUNT} components</Tag>
              <Tag tone="neutral">{ALL_COLOR_TOKENS.length} color tokens</Tag>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-border bg-white">
              <EmptyState
                icon={<Search />}
                title={`No sections match “${deferredQuery}”`}
                description="Try a component name (Button), a topic (contrast) or a pattern (empty state)."
                action={<Button variant="outline" onClick={() => setQuery('')}>Show all sections</Button>}
              />
            </div>
          ) : (
            groups.map(({ group, entries }) => (
              <Fragment key={group}>
                <p aria-hidden className="-mb-6 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wider text-text-subtle">{group}</p>
                {entries.map(({ id, Component }) => <Component key={id} />)}
              </Fragment>
            ))
          )}

          <footer className="border-t border-border pt-6 text-sm text-text-subtle">
            Source: <code className="font-mono text-xs">client/src/pages/design-system/</code> · Rules:{' '}
            <code className="font-mono text-xs">DESIGN.md</code> · Docs: <code className="font-mono text-xs">docs/DESIGN_SYSTEM.md</code>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default DesignSystemPage;
