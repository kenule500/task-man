import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FileText, Plus } from 'lucide-react';
import { Alert, EmptyState, SkeletonList, Surface } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWikiTree } from '../hooks/useWikiTree';
import { visibleRows } from '../lib/tree';
import { describeLastEdit } from '../lib/mentions';

interface ProjectWikiTabProps {
  workspaceSlug: string;
  /** Project name (pages reference their project by name, like tasks). */
  projectName: string;
  /** Holds `tasks:write`. */
  canWrite: boolean;
}

/** The Wiki tab of a project: its pages as an indented list that links into the wiki. */
const ProjectWikiTab = ({ workspaceSlug, projectName, canWrite }: ProjectWikiTabProps) => {
  const { pages, loading, error } = useWikiTree(workspaceSlug, projectName);
  const base = `/${encodeURIComponent(workspaceSlug)}/wiki`;
  const query = `project=${encodeURIComponent(projectName)}`;

  const rows = useMemo(() => {
    const parents = new Set(pages.map(page => page.parent).filter((id): id is string => Boolean(id)));
    return visibleRows(pages, parents);
  }, [pages]);

  if (loading) return <Surface padding="none"><SkeletonList label="Loading pages" rows={4} avatar={false} trailing={false} bare /></Surface>;
  if (error) return <Alert tone="error">{error}</Alert>;

  const openWiki = (
    <Link to={`${base}?${query}`} className={buttonVariants({ variant: 'outline' })}>
      <BookOpen aria-hidden /> Open wiki
    </Link>
  );

  if (pages.length === 0) {
    return (
      <Surface>
        <EmptyState
          icon={<BookOpen />}
          title="No wiki pages yet"
          description={canWrite
            ? 'Keep this project\'s guides, decisions and meeting notes next to its work.'
            : 'Nothing has been written for this project yet.'}
          action={canWrite
            ? (
              <Link to={`${base}?${query}&new=1`} className={cn(buttonVariants(), 'bg-primary text-white hover:bg-primary-hover')}>
                <Plus aria-hidden /> Create the first page
              </Link>
            )
            : undefined}
        />
      </Surface>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-subtle">{pages.length} {pages.length === 1 ? 'page' : 'pages'}</p>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Link to={`${base}?${query}&new=1`} className={buttonVariants({ variant: 'outline' })}>
              <Plus aria-hidden /> New page
            </Link>
          )}
          {openWiki}
        </div>
      </div>
      <Surface padding="none" radius="xl">
        <ul aria-label={`${projectName} wiki pages`} className="divide-y divide-slate-100">
          {rows.map(row => (
            <li key={row.page._id}>
              <Link
                to={`${base}/${row.page._id}?${query}`}
                style={{ paddingLeft: `${row.depth * 20 + 16}px` }}
                className="flex min-h-12 items-center gap-2 py-2 pr-4 outline-none hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus md:min-h-11"
              >
                <FileText aria-hidden className="size-4 shrink-0 text-text-subtle" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-strong">{row.page.title}</span>
                <span className="hidden shrink-0 text-xs text-text-subtle sm:inline">{describeLastEdit(row.page)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
};

export default ProjectWikiTab;
