import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Search } from 'lucide-react';
import { Alert, EmptyState, SearchInput, SkeletonList, Spinner } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useWikiSearch } from '../hooks/useWikiSearch';
import type { WikiPageSummary } from '../types';
import WikiTree from './WikiTree';

interface WikiNavProps {
  workspaceSlug: string;
  pages: readonly WikiPageSummary[];
  loading: boolean;
  error: string;
  selectedId?: string;
  expanded: ReadonlySet<string>;
  canWrite: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onNewPage: () => void;
  /** Called after a search result was chosen (closes the phone sheet). */
  onNavigate?: () => void;
}

const hitHref = (workspaceSlug: string, hit: { _id: string; project: string }) =>
  `/${encodeURIComponent(workspaceSlug)}/wiki/${hit._id}${hit.project ? `?project=${encodeURIComponent(hit.project)}` : ''}`;

/** Search box, "New page" and the page tree. Used in the side column and in the phone sheet. */
const WikiNav = ({
  workspaceSlug, pages, loading, error, selectedId, expanded, canWrite, onToggle, onSelect, onNewPage, onNavigate,
}: WikiNavProps) => {
  const { t } = useTranslation('projects');
  const [query, setQuery] = useState('');
  const search = useWikiSearch(workspaceSlug, query);

  return (
    <div className="space-y-3">
      <SearchInput label={t('wiki.searchPages')} placeholder={t('wiki.searchPages')} value={query} onValueChange={setQuery} />

      {search.active ? (
        <div aria-live="polite">
          {search.searching && <p className="flex items-center gap-2 px-1 py-2 text-sm text-text-subtle"><Spinner decorative /> {t('wiki.searching')}</p>}
          {search.error && <Alert tone="error">{search.error}</Alert>}
          {!search.searching && !search.error && search.hits.length === 0 && (
            <p className="px-1 py-2 text-sm text-text-subtle">{t('wiki.noMatch', { query: query.trim() })}</p>
          )}
          {search.hits.length > 0 && (
            <ul aria-label={t('wiki.searchResults')} className="space-y-1">
              {search.hits.map(hit => (
                <li key={hit._id}>
                  <Link
                    to={hitHref(workspaceSlug, hit)}
                    onClick={() => { setQuery(''); onNavigate?.(); }}
                    className="block min-h-11 rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus md:min-h-0"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-text-strong">
                      <FileText aria-hidden className="size-4 shrink-0 text-text-subtle" />
                      <span className="truncate">{hit.title}</span>
                    </span>
                    {hit.project && <span className="block ps-5.5 text-xs text-text-subtle">{hit.project}</span>}
                    {hit.snippet && <span className="line-clamp-2 block ps-5.5 text-xs text-text-subtle">{hit.snippet}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : loading ? (
        <SkeletonList label={t('wiki.loadingPages')} rows={5} avatar={false} trailing={false} bare />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : pages.length === 0 ? (
        <EmptyState
          headingLevel="h2"
          icon={<Search />}
          title={t('wiki.noPagesTitle')}
          description={canWrite ? t('wiki.noPagesWrite') : t('wiki.noPagesRead')}
          action={canWrite ? <Button type="button" onClick={onNewPage}><Plus aria-hidden /> {t('wiki.newPage')}</Button> : undefined}
          className="py-8"
        />
      ) : (
        <>
          {canWrite && (
            <Button type="button" variant="outline" onClick={onNewPage} className="h-11 w-full justify-start gap-2 md:h-9">
              <Plus aria-hidden /> {t('wiki.newPage')}
            </Button>
          )}
          <WikiTree pages={pages} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={id => { onSelect(id); onNavigate?.(); }} />
        </>
      )}
    </div>
  );
};

export default WikiNav;
