import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, FolderKanban, PanelLeft, Plus } from 'lucide-react';
import AppShell from '@/components/AppShell';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { EmptyState, ErrorState, PageHeader, SkeletonDetail, Surface, toast } from '@/components/ds';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/utils/api';
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { wikiApi } from '@/features/wiki/api';
import ConflictDialog from '@/features/wiki/components/ConflictDialog';
import NewPageDialog from '@/features/wiki/components/NewPageDialog';
import PageEditor from '@/features/wiki/components/PageEditor';
import VersionHistorySheet from '@/features/wiki/components/VersionHistorySheet';
import WikiDocument from '@/features/wiki/components/WikiDocument';
import WikiNav from '@/features/wiki/components/WikiNav';
import { useWikiPage } from '@/features/wiki/hooks/useWikiPage';
import { useWikiTree } from '@/features/wiki/hooks/useWikiTree';
import { ancestorsOf, expandedToReveal, planMove, summaryOf, visibleRows } from '@/features/wiki/lib/tree';
import type { WikiMoveKind, WikiPage as WikiPageData, WikiPageSummary } from '@/features/wiki/types';

interface Draft {
  id: string;
  title: string;
  content: string;
  /** Version the edit started from; saving on top of an older one is a conflict. */
  baseVersion: number;
}

interface NewPageTarget {
  open: boolean;
  parent: WikiPageSummary | null;
}

/**
 * The wiki: a page tree on the left and the document on the right, for the whole workspace or, with
 * `?project=<name>`, for one project. Reading is tasks:read, writing tasks:write, deleting tasks:delete.
 */
const WikiPage = () => {
  const { workspaceSlug = '', pageId } = useParams<{ workspaceSlug: string; pageId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('tasks:write');
  const canDelete = can('tasks:delete');
  const directory = useProjectDirectory();

  const project = searchParams.get('project') ?? '';
  const projectId = project ? directory.byName(project)?._id : undefined;
  const scopeLabel = project || 'Wiki';

  const tree = useWikiTree(workspaceSlug, project);
  const { page, loading: pageLoading, error: pageError, notFound, setPage, reload: reloadPage } = useWikiPage(workspaceSlug, pageId);
  const { setPages } = tree;

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [revealedFor, setRevealedFor] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState<WikiPageData | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newPage, setNewPage] = useState<NewPageTarget>({ open: false, parent: null });
  const [deleting, setDeleting] = useState<WikiPageData | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const query = project ? `?project=${encodeURIComponent(project)}` : '';
  const rootPath = `/${encodeURIComponent(workspaceSlug)}/wiki${query}`;
  const pathFor = useCallback(
    (id: string) => `/${encodeURIComponent(workspaceSlug)}/wiki/${id}${project ? `?project=${encodeURIComponent(project)}` : ''}`,
    [workspaceSlug, project],
  );

  const editing = draft && page && draft.id === page._id ? draft : null;
  const dirty = Boolean(editing && page && (editing.title !== page.title || editing.content !== page.content));

  // Open the branches above the page being shown (once per page, so they can be closed again afterwards)
  if (pageId && revealedFor !== pageId && tree.pages.some(item => item._id === pageId)) {
    setRevealedFor(pageId);
    setExpanded(previous => new Set([...previous, ...expandedToReveal(tree.pages, pageId)]));
  }

  // No page in the address: open the first one
  const firstPageId = tree.loading ? undefined : visibleRows(tree.pages, new Set())[0]?.page._id;
  useEffect(() => {
    if (!pageId && firstPageId) navigate(pathFor(firstPageId), { replace: true });
  }, [pageId, firstPageId, navigate, pathFor]);

  // A page belongs to one wiki: follow the page when the address names another one
  useEffect(() => {
    if (page && page._id === pageId && page.project !== project) {
      navigate(`/${encodeURIComponent(workspaceSlug)}/wiki/${page._id}${page.project ? `?project=${encodeURIComponent(page.project)}` : ''}`, { replace: true });
    }
  }, [page, pageId, project, workspaceSlug, navigate]);

  // "?new=1" (from the project's Wiki tab) opens the create dialog once
  const wantsNew = searchParams.get('new') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    // Syncing the address into UI state once; the parameter is removed right away
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canWrite) setNewPage({ open: true, parent: null });
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('new');
      return next;
    }, { replace: true });
  }, [wantsNew, canWrite, setSearchParams]);

  // Closing the tab or reloading with unsaved text asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const go = (path: string) => {
    if (dirty) {
      setPendingPath(path);
      return;
    }
    setDraft(null);
    navigate(path);
  };

  const toggle = (id: string) =>
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const syncSummary = (updated: WikiPageData) =>
    setPages(list => list.map(item => (item._id === updated._id ? summaryOf(updated) : item)));

  // ---------------------------------------------------------------- create
  const createPage = async (title: string) => {
    const parent = newPage.parent;
    try {
      const created = await wikiApi.create(workspaceSlug, { title, project, parent: parent?._id ?? null });
      setPages(list => [...list, summaryOf(created)]);
      if (parent) setExpanded(previous => new Set([...previous, parent._id]));
      setPage(created);
      setDraft({ id: created._id, title: created.title, content: '', baseVersion: created.version });
      navigate(pathFor(created._id));
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'We could not create the page. Check your connection and try again.'), { cause: err });
    }
  };

  // ---------------------------------------------------------------- edit and save
  const startEdit = () => {
    if (page) setDraft({ id: page._id, title: page.title, content: page.content, baseVersion: page.version });
    setSaveError('');
  };

  const save = async (version: number) => {
    if (!editing || !page) return;
    setSaving(true);
    setSaveError('');
    try {
      const result = await wikiApi.update(workspaceSlug, editing.id, version, { title: editing.title.trim(), content: editing.content });
      if (result.kind === 'conflict') {
        setConflict(result.page);
        return;
      }
      setPage(result.page);
      syncSummary(result.page);
      setDraft(null);
      setConflict(null);
      toast.success('Page saved');
    } catch (err) {
      setSaveError(getApiErrorMessage(err, 'We could not save the page. Check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const takeTheirs = () => {
    if (!conflict) return;
    setPage(conflict);
    syncSummary(conflict);
    setDraft(null);
    setConflict(null);
    toast.info('Showing the latest version');
  };

  // ---------------------------------------------------------------- page actions
  const move = async (kind: WikiMoveKind) => {
    if (!page) return;
    const plan = planMove(tree.pages, page._id, kind);
    if (!plan) return;
    try {
      const next = await wikiApi.move(workspaceSlug, page._id, plan);
      setPages(() => next);
      if (plan.parent) {
        const target = plan.parent;
        setExpanded(previous => new Set([...previous, target]));
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'We could not move the page. Try again.'));
    }
  };

  const toggleArchive = async () => {
    if (!page) return;
    try {
      const result = await wikiApi.update(workspaceSlug, page._id, page.version, { archived: !page.archived });
      setPage(result.page);
      syncSummary(result.page);
      if (result.kind === 'conflict') toast.error('Someone else changed this page. Showing their version; try again.');
      else toast.success(result.page.archived ? 'Page archived' : 'Page restored from the archive');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'We could not change the page. Try again.'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await wikiApi.remove(workspaceSlug, deleting._id);
      const parent = ancestorsOf(tree.pages, deleting._id).at(-1);
      toast.success(`Deleted "${deleting.title}"`);
      setDeleting(null);
      setDraft(null);
      tree.reload();
      navigate(parent ? pathFor(parent._id) : rootPath);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'We could not delete the page. Try again.'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const ancestors = useMemo(() => (page ? ancestorsOf(tree.pages, page._id) : []), [tree.pages, page]);
  const openNew = (parent: WikiPageSummary | null) => setNewPage({ open: true, parent });

  const nav = (onNavigate?: () => void) => (
    <WikiNav
      workspaceSlug={workspaceSlug}
      pages={tree.pages}
      loading={tree.loading}
      error={tree.error}
      selectedId={pageId}
      expanded={expanded}
      canWrite={canWrite}
      onToggle={toggle}
      onSelect={id => go(pathFor(id))}
      onNewPage={() => { onNavigate?.(); openNew(null); }}
      onNavigate={onNavigate}
    />
  );

  // ---------------------------------------------------------------- main column
  let main;
  if (!pageId) {
    main = tree.loading || firstPageId
      ? <Surface><SkeletonDetail label="Loading the wiki" fields={2} lines={4} /></Surface>
      : tree.error
        ? (
          <ErrorState
            title="We could not load the wiki"
            reason={tree.error}
            nextStep="Check your connection, then try again."
            action={<Button type="button" onClick={tree.reload}>Try again</Button>}
          />
        )
        : (
          <Surface>
            <EmptyState
              headingLevel="h2"
              icon={<BookOpen />}
              title={project ? `No pages in ${project} yet` : 'Your wiki is empty'}
              description={canWrite
                ? 'Write down how your team works: guides, decisions, meeting notes. Pages can be nested three levels deep.'
                : 'Nothing has been written here yet.'}
              action={canWrite ? <Button type="button" onClick={() => openNew(null)}><Plus aria-hidden /> Create the first page</Button> : undefined}
            />
          </Surface>
        );
  } else if (pageLoading) {
    main = <Surface><SkeletonDetail label="Loading the page" fields={2} lines={5} /></Surface>;
  } else if (notFound) {
    main = (
      <Surface>
        <EmptyState
          headingLevel="h2"
          icon={<BookOpen />}
          title="Page not found"
          description="It may have been deleted, or the link is wrong. Pick a page from the list."
          action={<Link to={rootPath} className={buttonVariants({ variant: 'outline' })}>Back to the wiki</Link>}
        />
      </Surface>
    );
  } else if (pageError || !page) {
    main = (
      <ErrorState
        title="We could not load this page"
        reason={pageError}
        nextStep="Check your connection, then try again."
        action={<Button type="button" onClick={reloadPage}>Try again</Button>}
      />
    );
  } else if (editing) {
    main = (
      <Surface padding="none" radius="xl" className="p-4 sm:p-6">
        <PageEditor
          workspaceSlug={workspaceSlug}
          title={editing.title}
          content={editing.content}
          mentions={page.mentions}
          onTitleChange={title => setDraft({ ...editing, title })}
          onContentChange={content => setDraft({ ...editing, content })}
          onSave={() => { void save(editing.baseVersion); }}
          onCancel={() => {
            if (dirty) setPendingPath(pathFor(page._id));
            else setDraft(null);
          }}
          saving={saving}
          dirty={dirty}
          error={saveError}
        />
      </Surface>
    );
  } else {
    main = (
      <WikiDocument
        workspaceSlug={workspaceSlug}
        page={page}
        pages={tree.pages}
        scopeLabel={scopeLabel}
        canWrite={canWrite}
        canDelete={canDelete}
        pathFor={pathFor}
        rootPath={rootPath}
        ancestors={ancestors}
        onEdit={startEdit}
        onHistory={() => setHistoryOpen(true)}
        onNewSubpage={() => openNew(tree.pages.find(item => item._id === page._id) ?? null)}
        onMove={kind => { void move(kind); }}
        onToggleArchive={() => { void toggleArchive(); }}
        onDelete={() => setDeleting(page)}
      />
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={project ? `${project} wiki` : 'Wiki'}
        description={project ? 'Pages for this project.' : 'Guides, decisions and notes for the whole workspace.'}
        actions={(
          <>
            <Button type="button" variant="outline" onClick={() => setNavOpen(true)} className="h-11 gap-1.5 lg:hidden">
              <PanelLeft aria-hidden /> Pages
            </Button>
            {projectId && (
              <Link to={`/${workspaceSlug}/projects/${projectId}?tab=wiki`} className={cn(buttonVariants({ variant: 'outline' }), 'h-11 gap-1.5 md:h-9')}>
                <FolderKanban aria-hidden /> Back to project
              </Link>
            )}
            {canWrite && (
              <Button type="button" onClick={() => openNew(null)} className="hidden h-9 gap-1.5 bg-primary text-white hover:bg-primary-hover lg:inline-flex">
                <Plus aria-hidden /> New page
              </Button>
            )}
          </>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside aria-label="Wiki navigation" className="hidden lg:block">
          <Surface padding="sm" className="sticky top-4 max-h-[calc(100dvh-7rem)] overflow-y-auto">
            {nav()}
          </Surface>
        </aside>
        <div className="min-w-0">{main}</div>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[88%] gap-0 sm:max-w-sm">
          <SheetHeader className="border-b border-slate-200 pr-12">
            <SheetTitle className="text-base font-bold text-text-strong">{scopeLabel} pages</SheetTitle>
            <SheetDescription className="sr-only">Search and browse the pages of this wiki.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {nav(() => setNavOpen(false))}
          </div>
        </SheetContent>
      </Sheet>

      <NewPageDialog
        open={newPage.open}
        onOpenChange={open => setNewPage(previous => ({ ...previous, open }))}
        parentTitle={newPage.parent?.title}
        onCreate={createPage}
      />

      {page && (
        <VersionHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          workspaceSlug={workspaceSlug}
          page={page}
          canRestore={canWrite && !editing}
          onRestored={restored => { setPage(restored); syncSummary(restored); }}
        />
      )}

      <ConflictDialog
        theirs={conflict}
        mine={{ title: editing?.title ?? '', content: editing?.content ?? '' }}
        busy={saving}
        onKeepMine={() => { if (conflict) void save(conflict.version); }}
        onTakeTheirs={takeTheirs}
        onClose={() => setConflict(null)}
      />

      <ConfirmActionDialog
        open={deleting !== null}
        onOpenChange={open => { if (!open) setDeleting(null); }}
        title="Delete this page?"
        description={`"${deleting?.title ?? ''}" and its history will be removed. Its subpages move up one level.`}
        confirmLabel="Delete page"
        busyLabel="Deleting"
        busy={deleteBusy}
        onConfirm={() => { void confirmDelete(); }}
      />

      <ConfirmActionDialog
        open={pendingPath !== null}
        onOpenChange={open => { if (!open) setPendingPath(null); }}
        title="Discard your changes?"
        description="You have unsaved changes on this page. If you leave now they are lost."
        confirmLabel="Discard changes"
        onConfirm={() => {
          const path = pendingPath;
          setPendingPath(null);
          setDraft(null);
          if (path && path !== pathFor(pageId ?? '')) navigate(path);
        }}
      />
    </AppShell>
  );
};

export default WikiPage;
