import { Skeleton } from '@/components/ui/skeleton';

/** Placeholder rows while a page loads; same height as real rows so the layout does not jump. */
export const AuditSkeleton = ({ rows = 8 }: { rows?: number }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading audit log"
    className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white"
  >
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="flex items-center gap-3 px-3 py-3.5 md:px-4">
        <Skeleton className="size-8 shrink-0 rounded-full bg-slate-200" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-3/4 bg-slate-200" />
          <Skeleton className="h-3 w-1/3 bg-slate-200" />
        </div>
        <Skeleton className="h-3 w-12 shrink-0 bg-slate-200 md:w-28" />
      </div>
    ))}
  </div>
);
