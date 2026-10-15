import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';

interface RecoveryCodesDialogProps {
  codes: string[];
  account: string;
  onClose: () => void;
}

/** New recovery codes, shown once. It stays open until the person confirms they saved them. */
export const RecoveryCodesDialog = ({ codes, account, onClose }: RecoveryCodesDialogProps) => {
  const [saved, setSaved] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && saved && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[100dvh] w-full max-w-full flex-col gap-4 overflow-hidden rounded-none border border-slate-200 bg-white p-0 shadow-2xl sm:max-h-[90dvh] sm:max-w-[480px] sm:rounded-xl"
      >
        <DialogHeader className="space-y-1 px-4 pt-5 sm:px-6 sm:pt-6">
          <DialogTitle className="text-lg font-bold text-slate-900">Your new recovery codes</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-600">
            The old codes no longer work.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-4 sm:px-6">
          <RecoveryCodesPanel codes={codes} account={account} />
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-800">
            <Checkbox checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
            I have saved these recovery codes
          </label>
        </div>
        <DialogFooter className="flex-row justify-end border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 sm:py-4">
          <Button type="button" disabled={!saved} onClick={onClose} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-10">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
