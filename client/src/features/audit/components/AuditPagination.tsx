import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeRange } from '../lib/format';
import type { AuditEntry } from '../types';

interface AuditPaginationProps {
  entries: AuditEntry[];
  hasNewer: boolean;
  hasOlder: boolean;
  onNewer: () => void;
  onOlder: () => void;
}

const BUTTON = 'h-10 flex-1 gap-1.5 px-4 text-sm sm:flex-none md:h-9';

/** Cursor pagination: "Older" follows `nextBefore`, "Newer" walks back through the cursors already used. */
export const AuditPagination = ({ entries, hasNewer, hasOlder, onNewer, onOlder }: AuditPaginationProps) => (
  <nav aria-label="Audit log pages" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-sm tabular-nums text-slate-600" aria-live="polite">
      {entries.length > 0 ? `Showing entries ${describeRange(entries)}` : 'No entries on this page'}
    </p>
    <div className="flex gap-2">
      <Button type="button" variant="outline" disabled={!hasNewer} onClick={onNewer} className={BUTTON}>
        <ChevronLeft aria-hidden />
        Newer
      </Button>
      <Button type="button" variant="outline" disabled={!hasOlder} onClick={onOlder} className={BUTTON}>
        Older
        <ChevronRight aria-hidden />
      </Button>
    </div>
  </nav>
);
