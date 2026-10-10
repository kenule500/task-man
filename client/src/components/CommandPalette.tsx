import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from 'cn';
import { Spinner } from '@/components/ds';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ProjectFolderIcon, projectsApi, type Project } from '@/features/projects';
import { StatusBadge, tasksApi, type Task } from '@/features/tasks';
import { COMMAND_GROUPS, buildCommandItems, searchCommands, type CommandItem } from './commandSearch';

const GROUPS = COMMAND_GROUPS;

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Workspace the search is scoped to. */
  slug: string;
  can: (permission: string) => boolean;
  /** Permission-gated pages stay hidden until permissions are known. */
  permissionsLoading?: boolean;
}

interface LoadedTasks {
  slug: string;
  tasks: Task[];
  /** Undefined when projects can't be read (names then come from the tasks). */
  projects?: Project[];
  failed: boolean;
}

const CommandPalette = ({ open, onOpenChange, slug, can, permissionsLoading = false }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (id: string) => `${uid}-${id}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [loaded, setLoaded] = useState<LoadedTasks | null>(null);

  const canSearchTasks = !permissionsLoading && can('tasks:read');
  const canSearchProjects = !permissionsLoading && can('projects:read');

  // Tasks load lazily each time the palette opens, so results are fresh
  useEffect(() => {
    if (!open || !canSearchTasks || !slug) return;
    let cancelled = false;
    Promise.all([
      tasksApi.list(slug),
      // Projects are a bonus: the palette still works with task names if they fail
      canSearchProjects ? projectsApi.list(slug).catch(() => undefined) : Promise.resolve(undefined),
    ])
      .then(([tasks, projects]) => !cancelled && setLoaded({ slug, tasks, projects, failed: false }))
      .catch(() => !cancelled && setLoaded({ slug, tasks: [], failed: true }));
    return () => {
      cancelled = true;
    };
  }, [open, canSearchTasks, canSearchProjects, slug]);

  const tasksReady = loaded?.slug === slug;
  const loadingTasks = open && canSearchTasks && !tasksReady;
  const gate = useMemo(
    () => (permissionsLoading ? () => false : can),
    [can, permissionsLoading],
  );
  const items = useMemo(
    () => buildCommandItems(slug, gate, tasksReady ? loaded.tasks : [], tasksReady ? loaded.projects : undefined),
    [slug, gate, tasksReady, loaded],
  );
  const results = useMemo(() => searchCommands(query, items), [query, items]);
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0));
  const activeItem = results[active];

  // Keep the highlighted option in view while moving with the arrow keys
  useEffect(() => {
    if (!open || !activeItem) return;
    document.getElementById(optionId(activeItem.id))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeItem?.id]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('');
      setActiveIndex(0);
    }
    onOpenChange(next);
  };

  const select = (item: CommandItem) => {
    handleOpenChange(false);
    navigate(item.href);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0 && event.key !== 'Escape') return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((active + 1) % results.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((active - 1 + results.length) % results.length);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(results.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (activeItem) select(activeItem);
        break;
    }
  };

  const trimmed = query.trim();
  const statusMessage = results.length
    ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
    : `No results for ${trimmed}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={inputRef}
        className="top-0 left-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:top-[12%] sm:left-1/2 sm:h-auto sm:max-h-[min(32rem,76dvh)] sm:max-w-xl sm:-translate-x-1/2 sm:rounded-xl"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Find pages, tasks and projects. Use the arrow keys to move and Enter to open.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-slate-200 px-3 pt-[env(safe-area-inset-top)]">
          <Search className="size-4 shrink-0 text-slate-500" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search tasks and pages"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? optionId(activeItem.id) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Search tasks, pages…"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
          />
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary sm:hidden"
          >
            Cancel
          </button>
          <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500 sm:inline">
            Esc
          </kbd>
        </div>

        <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>

        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Results"
          // Results scroll inside the dialog with a visible scrollbar; the search field and footer stay put
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] [scrollbar-gutter:stable] [scrollbar-width:thin]"
        >
          {GROUPS.map(group => {
            const groupItems = results.filter(item => item.group === group);
            if (groupItems.length === 0) return null;
            const headingId = `${uid}-group-${group}`;
            return (
              <li key={group} role="presentation">
                <ul role="group" aria-labelledby={headingId}>
                  <li
                    id={headingId}
                    role="presentation"
                    className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {group}
                  </li>
                  {groupItems.map(item => {
                    const Icon = item.icon;
                    const isActive = item === activeItem;
                    return (
                      <li
                        key={item.id}
                        id={optionId(item.id)}
                        role="option"
                        aria-selected={isActive}
                        onMouseMove={() => setActiveIndex(results.indexOf(item))}
                        onClick={() => select(item)}
                        className={cn(
                          'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-700',
                          isActive && 'bg-primary/10 text-slate-900',
                        )}
                      >
                        {item.project ? (
                          <ProjectFolderIcon size="sm" color={item.project.color} icon={item.project.icon} />
                        ) : Icon && (
                          <Icon className={cn('size-4 shrink-0', isActive ? 'text-primary' : 'text-slate-500')} aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.label}</span>
                          {item.hint && <span className="block truncate text-xs text-slate-500">{item.hint}</span>}
                        </span>
                        {item.task && <StatusBadge status={item.task.status} className="shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}

          {results.length === 0 && !loadingTasks && (
            <li role="presentation" className="px-3 py-10 text-center text-sm text-slate-500">
              No results for <span className="font-medium text-slate-700">“{trimmed}”</span>
            </li>
          )}
          {loadingTasks && (
            <li role="presentation" className="px-3 py-3 text-center text-xs text-slate-500"><Spinner decorative size="xs" className="mr-1.5 align-middle" />Loading tasks…</li>
          )}
          {loaded?.failed && tasksReady && (
            <li role="presentation" className="px-3 py-3 text-center text-xs text-slate-500">
              Tasks could not be loaded. Pages are still available.
            </li>
          )}
        </ul>

        <div className="hidden items-center gap-3 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 sm:flex">
          <span><kbd className="font-sans">↑↓</kbd> to move</span>
          <span><kbd className="font-sans">↵</kbd> to open</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommandPalette;
