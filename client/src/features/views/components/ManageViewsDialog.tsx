import { Pencil, Trash2 } from 'lucide-react';
import { Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { describeView } from '../lib/viewQuery';
import type { SavedView } from '../types';

interface ManageViewsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The views this user may change (see `editableViews`). */
  views: SavedView[];
  onEdit: (view: SavedView) => void;
  onDelete: (view: SavedView) => void;
}

/** Rename, share or delete saved views. */
const ManageViewsDialog = ({ open, onOpenChange, views, onEdit, onDelete }: ManageViewsDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85dvh] w-full max-w-full flex-col gap-0 overflow-hidden border border-slate-200 bg-white p-0 sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 pr-12 sm:px-6">
        <DialogTitle className="text-lg font-bold text-slate-900">Manage views</DialogTitle>
        <DialogDescription className="text-sm text-slate-600">
          Rename, share or delete the views you saved.
        </DialogDescription>
      </DialogHeader>
      {views.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-600 sm:px-6">You have no saved views yet.</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-2 py-1 sm:px-4">
          {views.map(view => (
            <li key={view._id} className="flex items-center gap-2 px-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <span className="truncate">{view.name}</span>
                  {view.shared && <Tag tone="primary" size="sm">Shared</Tag>}
                </p>
                <p className="truncate text-xs text-slate-600">{describeView(view)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Edit ${view.name}`}
                onClick={() => onEdit(view)}
                className="size-10 shrink-0 text-slate-600 hover:bg-slate-100 sm:size-8"
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete ${view.name}`}
                onClick={() => onDelete(view)}
                className="size-10 shrink-0 text-red-600 hover:bg-red-50 sm:size-8"
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  </Dialog>
);

export default ManageViewsDialog;
