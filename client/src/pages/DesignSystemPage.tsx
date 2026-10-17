import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { EmptyState, PageHeader, SearchInput, Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GuideToolbar } from './design-system/GuideToolbar';
import { GuidePreviewProvider } from './design-system/preview';
import { DOC_ENTRIES } from './design-system/registry';
import { GROUP_INFO, filterEntries, groupEntries, groupHeadingId } from './design-system/search';
import { ALL_COLOR_TOKENS } from './design-system/tokens';
import { useScrollSpy } from './design-system/useScrollSpy';
import { GUIDE_VERSION } from './design-system/version';
import { useSectionOutline } from './design-system/useSectionOutline';
import { collectPropNames } from './design-system/propIndex';

// Living style guide: tokens, components and patterns in one documentation site.
// Public route (/design-system) so designers and reviewers can open it without an account.
// Content lives in ./design-system (sections/*, registry.ts, tokens.ts); add a section there.
//
// Outline: h1 page, h2 group, h3 section or component, h4 sub-heading. Headings inside live examples are h5 or
// lower and sit in a [data-demo] area, so examples never compete with the section titles.

const COMPONENT_COUNT = DOC_ENTRIES.filter(entry => entry.group === 'Components').length;

const scrollToSection = (id: string) => {
  document.getElementById(id)?.scrollIntoView?.({ block: 'start' });
  if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`);
};

const DesignSystemPage = () => {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  // Prop names are read once from the rendered component pages, so searching for "headingLevel" finds its components
  const [propNames, setPropNames] = useState<Record<string, string>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPropNames(collectPropNames(DOC_ENTRIES.map(entry => entry.id)));
  }, []);
  const visible = useMemo(() => filterEntries(DOC_ENTRIES, deferredQuery, propNames), [deferredQuery, propNames]);
  const groups = useMemo(() => groupEntries(visible), [visible]);
  const ids = useMemo(() => visible.map(entry => entry.id), [visible]);
  const [active, setActive] = useScrollSpy(ids);
  const outline = useSectionOutline(active);

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
    <GuidePreviewProvider>
      {/* The guide is written in English: it stays left to right in any app language; examples follow the preview language */}
      <div lang="en" dir="ltr" className="relative min-h-screen overflow-x-clip bg-canvas text-text-body">
        <a
          href="#main"
          className="sr-only z-(--z-tooltip) rounded-lg bg-white px-4 py-2 text-sm font-medium text-text-strong shadow-floating focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus-visible:outline-2 focus-visible:outline-focus"
        >
          Skip to content
        </a>

        <header className="z-(--z-sticky) border-b border-border bg-white/95 backdrop-blur lg:sticky lg:top-0">
          <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            <p className="order-1 flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-text-strong lg:flex-none lg:basis-52">
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">T</span>
              <span className="truncate">TaskMan design system</span>
            </p>
            <Link
              to="/"
              className="order-2 inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-text-body outline-none hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus lg:order-5 lg:h-9"
            >
              <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
              Back to app
            </Link>
            <div className="order-3 w-full lg:max-w-sm lg:flex-1" role="search">
              <SearchInput label="Search sections and components" placeholder="Search sections, components and props" value={query} onValueChange={setQuery} />
            </div>
            <GuideToolbar className="order-4 w-full lg:ms-auto lg:w-auto" />
          </div>
        </header>

        {/* Phones and tablets: sections in a select instead of the side navigation */}
        <nav aria-label="Jump to section" className="sticky top-0 z-(--z-sticky) border-b border-border bg-white/95 px-4 py-2 backdrop-blur sm:px-6 lg:hidden">
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
        </nav>

        <div className="mx-auto max-w-[90rem] gap-8 px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:py-10 min-[85rem]:grid-cols-[13.5rem_minmax(0,1fr)_13rem]">
          <aside className="hidden lg:block">
            <nav aria-label="Sections" className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pe-2 pb-4">
              {groups.length === 0 ? (
                <p className="px-2 text-sm text-text-subtle">No matching sections.</p>
              ) : (
                groups.map(({ group, entries }) => (
                  <Fragment key={group}>
                    <p id={`nav-${group}`} className="mt-4 mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-text-subtle first:mt-0">
                      <a href={`#${groupHeadingId(group)}`} className="rounded outline-none hover:text-text-strong focus-visible:outline-2 focus-visible:outline-focus">{group}</a>
                    </p>
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
                                ? 'bg-primary/10 font-medium text-primary-hover'
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

          <main id="main" tabIndex={-1} className="min-w-0 space-y-14 outline-none">
            <div className="space-y-4">
              <PageHeader
                title="TaskMan design system"
                description="Tokens, components and patterns shared by every screen. Rules live in DESIGN.md."
              />
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone="primary">{GUIDE_VERSION}</Tag>
                <Tag tone="neutral">{COMPONENT_COUNT} components</Tag>
                <Tag tone="neutral">{ALL_COLOR_TOKENS.length} color tokens</Tag>
                <Tag tone="neutral">English, Français, العربية</Tag>
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white">
                <EmptyState
                  icon={<Search />}
                  title={`No sections match “${deferredQuery}”`}
                  description="Try a component name (Button), a prop (headingLevel), a topic (contrast) or a pattern (empty state)."
                  action={<Button variant="outline" onClick={() => setQuery('')}>Show all sections</Button>}
                />
              </div>
            ) : (
              groups.map(({ group, entries }, index) => (
                <div key={group} data-doc-group={GROUP_INFO[group].slug} className="space-y-10">
                  {/* A real heading with its own space: nothing is pulled up into it, so it can never overlap the first section title */}
                  <header className="scroll-mt-24 border-b border-border pb-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary-hover">
                      Part {index + 1} of {groups.length} · {entries.length} {entries.length === 1 ? 'page' : 'pages'}
                    </p>
                    <h2 id={groupHeadingId(group)} tabIndex={-1} className="mt-1.5 scroll-mt-32 text-3xl font-bold tracking-tight text-text-strong outline-none">{group}</h2>
                    <p className="mt-2 max-w-2xl text-sm text-text-subtle">{GROUP_INFO[group].summary}</p>
                  </header>
                  <div className="space-y-12">
                    {entries.map(({ id, Component }) => <Component key={id} />)}
                  </div>
                </div>
              ))
            )}

            <footer className="border-t border-border pt-6 text-sm text-text-subtle">
              Source: <code className="font-mono text-xs">client/src/pages/design-system/</code> · Rules:{' '}
              <code className="font-mono text-xs">DESIGN.md</code> · Docs: <code className="font-mono text-xs">docs/DESIGN_SYSTEM.md</code>
            </footer>
          </main>

          {/* Wide screens: the sub-headings of the section being read */}
          <aside className="hidden min-[85rem]:block">
            <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-4 ps-1">
              <p id="ds-toc-title" className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-subtle">On this page</p>
              {outline.length === 0 ? (
                <p className="text-sm text-text-subtle">No sub-sections.</p>
              ) : (
                <ul aria-labelledby="ds-toc-title" className="space-y-0.5 border-s border-border">
                  {outline.map(item => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="-ms-px block rounded-e-md border-s border-transparent py-1 ps-3 pe-2 text-sm text-text-subtle outline-none hover:border-text-subtle hover:text-text-strong focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          </aside>
        </div>
      </div>
    </GuidePreviewProvider>
  );
};

export default DesignSystemPage;
