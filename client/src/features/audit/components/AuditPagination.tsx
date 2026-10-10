import { Pagination } from '@/components/ds';
import { describeRange } from '../lib/format';
import type { AuditEntry } from '../types';

interface AuditPaginationProps {
  entries: AuditEntry[];
  hasNewer: boolean;
  hasOlder: boolean;
  onNewer: () => void;
  onOlder: () => void;
}

/** Cursor pagination: "Older" follows `nextBefore`, "Newer" walks back through the cursors already used. */
export const AuditPagination = ({ entries, hasNewer, hasOlder, onNewer, onOlder }: AuditPaginationProps) => (
  <Pagination
    compact
    label="Audit log pages"
    summary={entries.length > 0 ? `Showing entries ${describeRange(entries)}` : 'No entries on this page'}
    previousLabel="Newer"
    nextLabel="Older"
    hasPrevious={hasNewer}
    hasNext={hasOlder}
    onPrevious={onNewer}
    onNext={onOlder}
  />
);
