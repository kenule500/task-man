import type { FormEvent, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Alert, IconTile } from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: ReactNode;
  title: string;
  description: string;
  /** Form fields */
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  /** Label while `submitting` (e.g. "Saving...") */
  submittingLabel: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  /** Error from the last submit, announced to screen readers */
  error?: string;
  /** Dialog width from `sm` up */
  size?: 'sm' | 'md';
}

/**
 * Shared shell of form dialogs: header with icon, scrolling body, sticky footer.
 * Full screen on phones, a centered card from `sm` (see DESIGN.md, Responsive & mobile).
 */
const FormDialog = ({
  open, onOpenChange, icon, title, description, children, onSubmit, submitLabel, submittingLabel,
  submitting = false, submitDisabled = false, error, size = 'sm',
}: FormDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className={cn(
        'flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border border-slate-200 bg-white p-0 shadow-2xl',
        'sm:h-auto sm:max-h-[90dvh] sm:rounded-xl',
        size === 'md' ? 'sm:max-w-[560px]' : 'sm:max-w-[460px]',
      )}
    >
      <div className="shrink-0 border-b border-slate-200 px-4 pb-4 pr-12 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
        <div className="flex items-start gap-3">
          <IconTile>{icon}</IconTile>
          <DialogHeader className="min-w-0 space-y-0 p-0">
            <DialogTitle className="text-lg font-bold leading-tight text-slate-900">{title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-relaxed text-slate-600">{description}</DialogDescription>
          </DialogHeader>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        {/* The body must be allowed to shrink (min-h-0, flex-initial) so it scrolls inside the capped dialog on every breakpoint */}
        <div
          data-slot="form-dialog-body"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin] sm:flex-initial sm:px-6 sm:py-5"
        >
          {error && <Alert tone="error">{error}</Alert>}
          {children}
        </div>

        <DialogFooter className="!m-0 flex shrink-0 flex-row justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-2 sm:px-6 sm:py-4 sm:pb-4 [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-lg border-slate-300 text-sm font-medium text-slate-700 shadow-none hover:bg-slate-100 sm:h-10"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || submitDisabled}
            className="h-11 rounded-lg bg-primary px-5 text-sm font-medium text-white shadow-sm hover:bg-primary-hover sm:h-10"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> {submittingLabel}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);

export default FormDialog;
