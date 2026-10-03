import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Task } from '../types';

interface ConfirmDeleteDialogProps {
  /** Task pending deletion; `null` keeps the dialog closed. */
  task: Task | null;
  onCancel: () => void;
  onConfirm: (task: Task) => Promise<unknown> | void;
}

const ConfirmDeleteDialog = ({ task, onCancel, onConfirm }: ConfirmDeleteDialogProps) => {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    if (!task) return;
    setDeleting(true);
    try {
      await onConfirm(task);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={task !== null} onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent className="bg-white border border-gray-200 shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-bold text-slate-900">Delete this task?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-slate-500">
            “{task?.title}” will be permanently removed, along with any dependency links to it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="bg-gray-50 border-t border-gray-200">
          <AlertDialogCancel className="border-gray-300 text-slate-700 hover:bg-gray-100">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={deleting}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {deleting ? 'Deleting...' : 'Delete task'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmDeleteDialog;
