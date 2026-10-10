import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Label while `busy` (e.g. "Removing...") */
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
}

/** Confirmation for destructive actions (replaces `window.confirm`). */
const ConfirmActionDialog = ({
  open, onOpenChange, title, description, confirmLabel, busyLabel, busy = false, onConfirm,
}: ConfirmActionDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent className="border border-slate-200 bg-white shadow-2xl">
      <AlertDialogHeader>
        <AlertDialogTitle className="text-base font-bold text-slate-900">{title}</AlertDialogTitle>
        <AlertDialogDescription className="text-sm text-slate-600">{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="border-t border-slate-200 bg-slate-50">
        <AlertDialogCancel className="border-slate-300 text-slate-700 hover:bg-slate-100">Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} disabled={busy} className="bg-danger-solid text-white hover:bg-danger-solid-hover">
          {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default ConfirmActionDialog;
