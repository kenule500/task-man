import { useCallback, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, ScrollText, ShieldAlert } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, Surface, toast, Spinner } from '@/components/ds';
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
  const { t } = useTranslation('settings');
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
      toast.success(t('audit.exported'));
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('audit.exportFailed')));
    } finally {
      setExporting(false);
    }
  };

  if (!allowed) {
    return (
      <div>
        <PageHeader title={t('audit.title')} />
        <Surface className="mt-6">
          <EmptyState
            headingLevel="h2"
            icon={<ShieldAlert />}
            title={t('audit.restrictedTitle')}
            description={t('audit.restrictedDescription')}
          />
        </Surface>
      </div>
    );
  }

  const retention = page?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const items = page?.items ?? [];
  const filtered = hasActiveFilters(filters);

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        title={t('audit.title')}
        description={t('audit.description', { count: retention })}
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
              {exporting ? <Spinner decorative /> : <Download aria-hidden />}
              {exporting ? t('audit.exporting') : t('audit.exportCsv')}
            </Button>
          </>
        )}
      />

      <Surface padding="sm" className="sm:p-5">
        <AuditFilterBar filters={filters} members={members} onChange={changeFilters} />
        <p className="mt-3 text-xs text-slate-600">{t('audit.exportHint')}</p>
      </Surface>

      <div className="space-y-4">
        {loading ? (
          <AuditSkeleton />
        ) : error ? (
          <Surface>
            <ErrorState
              title={t('audit.loadFailed')}
              reason={error}
              nextStep={t('audit.loadFailedNext')}
              action={<Button type="button" onClick={retry} className="h-10 px-4 md:h-9">{t('common:retry')}</Button>}
            />
          </Surface>
        ) : items.length === 0 ? (
          <Surface>
            <EmptyState
            headingLevel="h2"
              icon={<ScrollText />}
              title={filtered ? t('audit.noMatchTitle') : t('audit.emptyTitle')}
              description={filtered ? t('audit.noMatchDescription') : t('audit.emptyDescription')}
              action={filtered ? (
                <Button type="button" variant="outline" onClick={() => changeFilters({ area: '', actor: '' })} className="h-10 px-4 md:h-9">
                  {t('audit.clearFilters')}
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
