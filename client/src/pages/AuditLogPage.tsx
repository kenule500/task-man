import { useCallback, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Download, Loader2, ScrollText, ShieldAlert } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, Surface, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  AuditEntrySheet, AuditFilterBar, AuditList, AuditPagination, AuditSkeleton, AuditTable,
  auditApi, downloadBlob, hasActiveFilters, parseAuditFilters, useAuditLog, useIsPhone, withAuditFilters,
  type AuditEntry, type AuditFilters,
} from '@/features/audit';
import { useWorkspaceMembers } from '@/features/tasks';
import { getApiErrorMessage } from '@/utils/api';
import { usePermissions } from '../hooks/usePermissions';

const DEFAULT_RETENTION_DAYS = 365;

const AuditLogPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();
  const allowed = can('settings:manage');
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseAuditFilters(searchParams);
  const phone = useIsPhone();

  const { page, loading, error, hasNewer, hasOlder, older, newer, retry } = useAuditLog(allowed ? workspaceSlug : undefined, filters);
  const { members } = useWorkspaceMembers(workspaceSlug, allowed);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  const changeFilters = useCallback((next: AuditFilters) => {
    setSearchParams(withAuditFilters(searchParams, next), { replace: true });
  }, [searchParams, setSearchParams]);

  const exportCsv = async () => {
    if (!workspaceSlug || exporting) return;
    setExporting(true);
    try {
      const blob = await auditApi.exportCsv(workspaceSlug, filters);
      downloadBlob(blob, `audit-${workspaceSlug}-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Audit log exported');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'We could not export the audit log.'));
    } finally {
      setExporting(false);
    }
  };

  if (!allowed) {
    return (
      <div className="max-w-6xl">
        <PageHeader title="Audit log" />
        <Surface className="mt-6">
          <EmptyState
            headingLevel="h2"
            icon={<ShieldAlert />}
            title="Only people who manage settings can see the audit log"
            description="Ask an owner or admin of this workspace if you need to see the audit log."
          />
        </Surface>
      </div>
    );
  }

  const retention = page?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const items = page?.items ?? [];
  const filtered = hasActiveFilters(filters);

  return (
    <div className="max-w-6xl space-y-5 pb-6">
      <PageHeader
        title="Audit log"
        description={`Every change in this workspace: who did what, when and from where. Entries are kept for ${retention} days.`}
        actions={(
          <>
            <Button
              type="button"
              variant="outline"
              onClick={exportCsv}
              disabled={exporting || loading}
              aria-busy={exporting}
              className="h-10 gap-2 px-4 text-sm md:h-9"
            >
              {exporting ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Download aria-hidden />}
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </>
        )}
      />

      <Surface padding="sm" className="sm:p-5">
        <AuditFilterBar filters={filters} members={members} onChange={changeFilters} />
        <p className="mt-3 text-xs text-slate-600">The export includes the entries that match these filters.</p>
      </Surface>

      <div className="space-y-4">
        {loading ? (
          <AuditSkeleton />
        ) : error ? (
          <Surface>
            <ErrorState
              title="Could not load the audit log"
              reason={error}
              nextStep="Check your connection and try again."
              action={<Button type="button" onClick={retry} className="h-10 px-4 md:h-9">Try again</Button>}
            />
          </Surface>
        ) : items.length === 0 ? (
          <Surface>
            <EmptyState
            headingLevel="h2"
              icon={<ScrollText />}
              title={filtered ? 'No entries match these filters' : 'No entries yet'}
              description={filtered
                ? 'Try another area or actor, or clear the filters to see everything.'
                : 'Changes to tasks, projects, sprints, members and settings will appear here.'}
              action={filtered ? (
                <Button type="button" variant="outline" onClick={() => changeFilters({ area: '', actor: '' })} className="h-10 px-4 md:h-9">
                  Clear filters
                </Button>
              ) : undefined}
            />
          </Surface>
        ) : phone ? (
          <AuditList entries={items} onSelect={setSelected} />
        ) : (
          <AuditTable entries={items} selectedId={selected?._id} onSelect={setSelected} />
        )}

        {!loading && !error && (items.length > 0 || hasNewer) && (
          <AuditPagination entries={items} hasNewer={hasNewer} hasOlder={hasOlder} onNewer={newer} onOlder={older} />
        )}
      </div>

      <AuditEntrySheet entry={selected} slug={workspaceSlug ?? ''} phone={phone} onClose={() => setSelected(null)} />
    </div>
  );
};

export default AuditLogPage;
