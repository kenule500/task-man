import type { ReactNode, RefObject } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface DialogShellProps {
  title: string;
  description: ReactNode;
  icon: ReactNode;
  onClose: () => void;
  /** Body and footer; use `DialogBody` and `DialogFooter` below. Wrap in a <form> by passing `as`. */
  children: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Wider layout for tables */
  wide?: boolean;
}

/** Full-screen dialog on phones, centered card from `sm`; scrolls inside, with a sticky footer. Mount only while open. */
export const DialogShell = ({ title, description, icon, onClose, children, initialFocus, wide }: DialogShellProps) => (
  <Dialog open onOpenChange={open => !open && onClose()}>
    <DialogContent
      initialFocus={initialFocus}
      className={`flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border border-slate-200 bg-white p-0 shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:rounded-xl ${wide ? 'sm:max-w-[760px]' : 'sm:max-w-[600px]'}`}
    >
      <div className="shrink-0 border-b border-slate-200 px-4 pb-4 pr-12 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start gap-3">
          <div aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
            {icon}
          </div>
          <DialogHeader className="min-w-0 gap-1 p-0">
            <DialogTitle className="text-lg font-bold leading-tight text-slate-900">{title}</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">{description}</DialogDescription>
          </DialogHeader>
        </div>
      </div>
      {children}
    </DialogContent>
  </Dialog>
);

export const DialogBody = ({ children }: { children: ReactNode }) => (
  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:max-h-[62vh] sm:flex-none sm:px-6 sm:py-5">{children}</div>
);

export const DialogActions = ({ children }: { children: ReactNode }) => (
  <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
    {children}
  </div>
);
