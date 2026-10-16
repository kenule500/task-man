import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { ChevronDown, Keyboard, LifeBuoy, Search, SearchX, X } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { EmptyState, IconTile, PageHeader, SectionHeader, Surface, Tag } from '@/components/ds';
import { Input } from '@/components/ui/input';
import {
  faqCategories, highlightSegments, queryTerms, searchFaq, type FaqResult,
} from '@/content/faq';
import { cn } from '@/lib/utils';

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700">
    {children}
  </kbd>
);

const SHORTCUTS: { id: string; keys: ReactNode }[] = [
  { id: 'search', keys: <><Kbd>Ctrl</Kbd> + <Kbd>K</Kbd></> },
  { id: 'sidebar', keys: <><Kbd>Ctrl</Kbd> + <Kbd>B</Kbd></> },
  { id: 'moveBar', keys: <><Kbd>←</Kbd> <Kbd>→</Kbd></> },
  { id: 'resizeBar', keys: <><Kbd>Shift</Kbd> + <Kbd>←</Kbd> <Kbd>→</Kbd></> },
  { id: 'comment', keys: <><Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd></> },
  { id: 'today', keys: <Kbd>T</Kbd> },
  { id: 'close', keys: <Kbd>Esc</Kbd> },
];

const Highlighted = ({ text, terms }: { text: string; terms: string[] }) => (
  <>
    {highlightSegments(text, terms).map((segment, index) =>
      segment.match ? (
        <mark key={index} className="rounded-sm bg-warning-bg px-0.5 text-slate-900">{segment.text}</mark>
      ) : (
        <span key={index}>{segment.text}</span>
      ),
    )}
  </>
);

interface FaqEntryProps {
  item: FaqResult;
  terms: string[];
  open: boolean;
  onToggle: () => void;
  showCategory: boolean;
}

const FaqEntry = ({ item, terms, open, onToggle, showCategory }: FaqEntryProps) => {
  const baseId = useId();
  const buttonId = `${baseId}-q`;
  const panelId = `${baseId}-a`;

  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-12 w-full items-start justify-between gap-3 px-4 py-3.5 text-start text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5"
        >
          <span className="min-w-0">
            <Highlighted text={item.question} terms={terms} />
            {showCategory && (
              <Tag size="sm" className="ms-2 align-middle font-normal">{item.categoryTitle}</Tag>
            )}
          </span>
          <ChevronDown
            className={cn('mt-0.5 size-4 shrink-0 text-slate-500 motion-safe:transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        inert={!open}
        className={cn(
          'grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-slate-700 sm:px-5">
            <Highlighted text={item.answer} terms={terms} />
          </p>
        </div>
      </div>
    </li>
  );
};

const HelpPage = () => {
  const { t, i18n } = useTranslation('landing');
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  // Keep ?q= in sync without adding history entries
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (current === query) return;
    const next = new URLSearchParams(searchParams);
    if (query) next.set('q', query);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }, [query, searchParams, setSearchParams]);

  const terms = useMemo(() => queryTerms(query), [query]);
  // The content is translated when it is read, so it is read again when the language changes
  const categories = useMemo(() => faqCategories(), [i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches = useMemo(() => searchFaq(query, categories), [query, categories]);
  const countByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const match of matches) counts[match.categoryId] = (counts[match.categoryId] ?? 0) + 1;
    return counts;
  }, [matches]);

  const visible = categoryId === 'all' ? matches : matches.filter((match) => match.categoryId === categoryId);
  const searching = terms.length > 0;

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearFilters = () => {
    setQuery('');
    setCategoryId('all');
  };

  const countLabel = searching
    ? t('help.countFor', { count: visible.length, query: query.trim() })
    : t('help.count', { count: visible.length });

  // Without a search, group by category; with one, show a single ranked list
  const groups = searching
    ? [{ id: 'results', title: '', items: visible }]
    : categories
        .map((category) => ({
          id: category.id,
          title: category.title,
          items: visible.filter((match) => match.categoryId === category.id),
        }))
        .filter((group) => group.items.length > 0);

  return (
    <AppShell>
      <div className="w-full max-w-3xl space-y-6">
        <PageHeader title={t('help.title')} description={t('help.description')} />

        <Surface padding="md" className="space-y-4 bg-gradient-to-br from-primary/5 to-white">
          <div role="search">
            <label htmlFor="help-search" className="mb-1.5 block text-sm font-medium text-slate-700">
              {t('help.searchLabel')}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
              <Input
                id="help-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && query) {
                    event.preventDefault();
                    setQuery('');
                  }
                }}
                placeholder={t('help.searchPlaceholder')}
                autoComplete="off"
                enterKeyHint="search"
                className="h-12 rounded-xl border-slate-300 bg-white ps-11 pe-12 text-base shadow-none placeholder:text-slate-500 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('common:clearSearch')}
                  className="absolute end-1.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-600">
              {countLabel}
            </p>
          </div>

          <div role="group" aria-label={t('help.filterByTopic')} className="flex flex-wrap gap-2">
            {[{ id: 'all', title: t('help.allTopics'), count: matches.length }, ...categories.map((category) => ({
              id: category.id,
              title: category.title,
              count: countByCategory[category.id] ?? 0,
            }))].map((chip) => {
              const active = categoryId === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryId(chip.id)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    active
                      ? 'border-primary bg-primary text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    !active && chip.count === 0 && 'text-slate-500',
                  )}
                >
                  {chip.title}
                  <span className={cn('tabular-nums', active ? 'text-white' : 'text-slate-500')}>{chip.count}</span>
                </button>
              );
            })}
          </div>
        </Surface>

        {visible.length === 0 ? (
          <Surface padding="none">
            <EmptyState
              icon={<SearchX />}
              title={t('help.noAnswers')}
              description={
                searching
                  ? t('help.noMatch', { query: query.trim() })
                  : t('help.noAnswersInTopic')
              }
              action={
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {t('help.clearAll')}
                </button>
              }
            />
          </Surface>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <Surface key={group.id} as="section" padding="none" aria-label={group.title || t('help.results')} className="overflow-hidden">
                {group.title && (
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 sm:px-5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">{group.title}</h2>
                  </div>
                )}
                <ul>
                  {group.items.map((item) => (
                    <FaqEntry
                      key={item.id}
                      item={item}
                      terms={terms}
                      open={openIds.has(item.id)}
                      onToggle={() => toggle(item.id)}
                      showCategory={searching}
                    />
                  ))}
                </ul>
              </Surface>
            ))}
          </div>
        )}

        <Surface as="section" aria-labelledby="shortcuts-heading" className="sm:p-6">
          <SectionHeader
            icon={<Keyboard className="size-4" aria-hidden />}
            title={<span id="shortcuts-heading">{t('help.shortcuts')}</span>}
          />
          <p className="mb-3 text-xs text-slate-600">
            {t('help.shortcutsHint')}
          </p>
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {SHORTCUTS.map(({ id, keys }) => (
              <div key={id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <dt className="text-sm text-slate-700">{t(`help.shortcutList.${id}`)}</dt>
                <dd className="flex shrink-0 flex-wrap items-center gap-1">{keys}</dd>
              </div>
            ))}
          </dl>
        </Surface>

        <Surface as="section" aria-labelledby="contact-heading" className="flex items-start gap-3 sm:p-6">
          <IconTile><LifeBuoy /></IconTile>
          <div className="min-w-0 text-sm leading-relaxed text-slate-700">
            <h2 id="contact-heading" className="font-semibold text-slate-900">{t('help.contactTitle')}</h2>
            <p className="mt-1">
              <Trans
                t={t}
                i18nKey="help.contact"
                components={{ m: <a href="mailto:support@taskman.io" className="font-medium text-primary hover:underline" /> }}
              />
            </p>
          </div>
        </Surface>
      </div>
    </AppShell>
  );
};

export default HelpPage;
