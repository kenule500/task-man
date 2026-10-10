import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, BookmarkPlus, Check, ChevronDown, Settings2 } from 'lucide-react';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Spinner, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskView } from '@/features/tasks';
import { cn } from '@/lib/utils';
import { useSavedViews } from '../hooks/useSavedViews';
import { describeView, editableViews, groupViews, isViewActive, savedQueryFromParams, viewHref } from '../lib/viewQuery';
import type { SavedView } from '../types';
import ManageViewsDialog from './ManageViewsDialog';
import SaveViewDialog from './SaveViewDialog';

interface ViewsMenuProps {
  slug: string;
  /** The layout on screen. */
  layout: TaskView;
  /** The page's current query string; the filters in it are what "Save current view" keeps. */
  params: URLSearchParams;
  /** People with `settings:manage` can also rename and delete shared views. */
  canManageShared?: boolean;
  className?: string;
}

const ITEM_CLASS = 'min-h-11 text-slate-700 md:min-h-0';

type Dialog =
  | { kind: 'none' }
  | { kind: 'save' }
  | { kind: 'manage' }
  | { kind: 'edit'; view: SavedView }
  | { kind: 'delete'; view: SavedView };

/** "Views" menu of the task toolbar: open a saved view, save the current one, manage the list. */
const ViewsMenu = ({ slug, layout, params, canManageShared = false, className }: ViewsMenuProps) => {
  const navigate = useNavigate();
  const { views, loading, failed, create, update, remove } = useSavedViews(slug);
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const [deleting, setDeleting] = useState(false);

  const { mine, shared } = groupViews(views);
  const editable = editableViews(views, canManageShared);
  const currentQuery = savedQueryFromParams(params);

  const renderItem = (view: SavedView) => {
    const active = isViewActive(view, layout, params);
    return (
      <DropdownMenuItem key={view._id} onClick={() => navigate(viewHref(slug, view))} className={cn(ITEM_CLASS, 'items-start py-1.5')}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{view.name}</span>
          <span className="block truncate text-xs text-slate-500">
            {view.mine ? describeView(view) : `${view.owner.name || 'A teammate'} · ${describeView(view)}`}
          </span>
        </span>
        {active && (
          <>
            <Check className="mt-0.5 text-primary" aria-hidden />
            <span className="sr-only">(current view)</span>
          </>
        )}
      </DropdownMenuItem>
    );
  };

  const closeDialog = (open: boolean) => { if (!open) setDialog({ kind: 'none' }); };

  const confirmDelete = async (view: SavedView) => {
    setDeleting(true);
    const failure = await remove(view._id);
    setDeleting(false);
    setDialog(editable.some(item => item._id !== view._id) ? { kind: 'manage' } : { kind: 'none' });
    if (failure) toast.error(failure);
    else toast.success(`Deleted view “${view.name}”`);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              aria-label="Views"
              className={cn('h-11 w-11 shrink-0 gap-1.5 border-slate-200 bg-white px-0 text-slate-700 sm:h-9 sm:w-auto sm:px-3', className)}
            />
          }
        >
          <Bookmark className="size-4" aria-hidden />
          <span className="hidden sm:inline">Views</span>
          <ChevronDown className="hidden size-3.5 text-slate-500 sm:inline" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuItem onClick={() => setDialog({ kind: 'save' })} className={ITEM_CLASS}>
            <BookmarkPlus /> Save current view…
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-slate-100" />

          {loading && <p role="status" className="flex items-center gap-2 px-2 py-2 text-xs text-slate-600"><Spinner decorative size="xs" />Loading views…</p>}
          {failed && <p role="status" className="px-2 py-2 text-xs text-slate-600">We could not load your saved views.</p>}
          {!loading && !failed && views.length === 0 && (
            <p className="px-2 py-2 text-xs text-slate-600">No saved views yet. Set the filters you want, then save them here.</p>
          )}

          {mine.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Mine</DropdownMenuLabel>
              {mine.map(renderItem)}
            </DropdownMenuGroup>
          )}
          {shared.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Shared</DropdownMenuLabel>
              {shared.map(renderItem)}
            </DropdownMenuGroup>
          )}

          {editable.length > 0 && (
            <>
              <DropdownMenuSeparator className="bg-slate-100" />
              <DropdownMenuItem onClick={() => setDialog({ kind: 'manage' })} className={ITEM_CLASS}>
                <Settings2 /> Manage views…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog.kind === 'save' && (
        <SaveViewDialog
          open
          onOpenChange={closeDialog}
          mode="create"
          summary={describeView({ view: layout, query: currentQuery })}
          onSubmit={async (name, isShared) => {
            const failure = await create({ name, view: layout, query: currentQuery, shared: isShared });
            if (!failure) toast.success(`Saved view “${name}”`);
            return failure;
          }}
        />
      )}

      <ManageViewsDialog
        open={dialog.kind === 'manage'}
        onOpenChange={closeDialog}
        views={editable}
        onEdit={view => setDialog({ kind: 'edit', view })}
        onDelete={view => setDialog({ kind: 'delete', view })}
      />

      {dialog.kind === 'edit' && (
        <SaveViewDialog
          open
          onOpenChange={open => { if (!open) setDialog({ kind: 'manage' }); }}
          mode="rename"
          initialName={dialog.view.name}
          initialShared={dialog.view.shared}
          canShare={dialog.view.mine}
          summary={describeView(dialog.view)}
          onSubmit={async (name, isShared) => {
            const failure = await update(dialog.view._id, dialog.view.mine ? { name, shared: isShared } : { name });
            if (!failure) toast.success('View updated');
            return failure;
          }}
        />
      )}

      <ConfirmActionDialog
        open={dialog.kind === 'delete'}
        onOpenChange={open => { if (!open) setDialog({ kind: 'manage' }); }}
        title="Delete this view?"
        description={dialog.kind === 'delete'
          ? `“${dialog.view.name}” will be removed${dialog.view.shared ? ' for everyone it is shared with' : ''}. Tasks are not affected.`
          : ''}
        confirmLabel="Delete view"
        busyLabel="Deleting..."
        busy={deleting}
        onConfirm={() => dialog.kind === 'delete' && confirmDelete(dialog.view)}
      />
    </>
  );
};

export default ViewsMenu;
